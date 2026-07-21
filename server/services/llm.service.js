import OpenAI from 'openai';

// Ortam değişkenlerinden yapılandırmayı oku
const apiKey = process.env.LLM_API_KEY;
const baseURL = process.env.LLM_BASE_URL;
const modelName = process.env.LLM_MODEL_NAME || 'gpt-3.5-turbo';

let openaiClient = null;

if (apiKey) {
  try {
    openaiClient = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL || undefined, // Eğer özel bir endpoint varsa (örn. kurumsal API)
    });
  } catch (error) {
    console.warn('OpenAI istemcisi başlatılamadı, fallback modu kullanılacak:', error.message);
  }
}

/**
 * Kural tabanlı (rule-based) yedek özetleyici.
 * LLM erişimi olmadığında veya hata alındığında çalışır.
 */
function generateFallbackSummary(campId, topStatements) {
  if (!topStatements || topStatements.length === 0) {
    return `Grup ${String.fromCharCode(65 + campId)}: Henüz fikir örüntüsü netleşmemiş katılımcılar.`;
  }

  // En yüksek contrastScore veya onay oranına sahip ilk iki ifadeyi seçelim
  const mainStatements = topStatements.slice(0, 2).map(st => {
    // Tırnak işaretlerini temizleyelim ve cümlenin ilk 60 karakterini alalım
    let text = st.text.replace(/["']/g, '').trim();
    if (text.length > 60) {
      text = text.substring(0, 57) + '...';
    }
    return `"${text}"`;
  });

  if (mainStatements.length === 1) {
    return `Bu grup, ağırlıklı olarak ${mainStatements[0]} görüşünü desteklemektedir.`;
  }

  return `Bu grup, öncelikli olarak ${mainStatements[0]} ve ${mainStatements[1]} fikirlerini destekleyen ve bu doğrultuda ortaklaşan katılımcılardan oluşmaktadır.`;
}

/**
 * Bir fikir kümesinin en çok desteklediği görüşleri analiz ederek Türkçe bir özet metni üretir.
 * @param {number|string} campId - Küme ID
 * @param {Array} topStatements - Kümenin en çok onayladığı görüşler dizisi
 * @returns {Promise<string>} 1-2 cümlelik Türkçe küme özeti
 */
export async function generateClusterSummary(campId, topStatements) {
  // Eğer OpenAI istemcisi yoksa veya hiç görüş yoksa doğrudan fallback çalıştır
  if (!openaiClient || !topStatements || topStatements.length === 0) {
    return generateFallbackSummary(campId, topStatements);
  }

  try {
    const statementsText = topStatements
      .map((st, i) => `${i + 1}. Görüş: "${st.text}" (Onay Oranı: %${st.approvalRate || 0})`)
      .join('\n');

    const prompt = `
Aşağıda, bir müzakere platformunda aynı fikir kümesinde (kampta) yer alan katılımcıların en çok onayladığı görüşler listelenmiştir:

${statementsText}

Görevin: Bu verileri analiz ederek, bu grubun ortak görüşlerini ve duruşunu özetleyen, 1 ya da en fazla 2 cümlelik, akıcı, tarafsız ve profesyonel bir Türkçe grup profili yaz. 
Notlar:
- Asla "Bu grup...", "Özetle...", "1. Görüşe göre..." gibi klişe kalıplarla başlamamaya çalış. Akıcı ve doğrudan bir tanım yap.
- Üçüncü şahıs gözünden (örneğin "Ulaşımda çevreci çözümleri ve yaya haklarını önceliklendiren, bireysel araç kullanımını sınırlandırmayı savunan katılımcılar.") yaz.
- Çıktı sadece 1-2 cümlelik özet metinden oluşmalıdır, başka açıklama ekleme.
`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen müzakere verilerini ve fikir gruplarını özetleyen tarafsız bir analiz asistanısın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.5,
    });

    const summary = response.choices[0]?.message?.content?.trim();
    if (summary) {
      return summary;
    }

    throw new Error('LLM boş yanıt döndürdü.');
  } catch (err) {
    console.error(`LLM Özet oluşturma hatası (Grup ${campId} için), fallback uygulanıyor:`, err.message);
    return generateFallbackSummary(campId, topStatements);
  }
}

/**
 * Kural tabanlı yerel denetleyici (Regex Fallback).
 * LLM çalışmadığında temel spam, bağlantı adresi ve yaygın küfürleri tespit eder.
 */
function evaluateOpinionFallback(text) {
  const cleanText = text.toLowerCase().trim();

  // 1. Link / URL Tespiti
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9]+\.(com|net|org|edu|gov|mil|info|biz|co|io|xyz|info|tr|us|uk|de|ru|asia|online|site|app|dev))/i;
  if (urlPattern.test(cleanText)) {
    return { flagged: true, reason: 'Reklam veya spam bağlantı adresi içeriyor olabilir.' };
  }

  // 2. Çok kısa / Rastgele Karakter Tespiti (Örn: "asdasdasd", "qwerty")
  if (cleanText.length < 5) {
    return { flagged: true, reason: 'Görüş metni çok kısa veya anlamsız.' };
  }
  const randomPattern = /(asdasd|qwert|sdfgh|zxcvb|yhnjm)/;
  if (randomPattern.test(cleanText)) {
    return { flagged: true, reason: 'Anlamsız karakter dizisi (spam) içeriyor olabilir.' };
  }

  // 3. Yaygın Türkçe küfür ve hakaret filtrelemesi (Temel düzeyde)
  const badWords = ['siktir', 'sikik', 'orospu', 'amk', 'aq', 'picoğlu', 'göt', 'şerefsiz', 'amına', 'yavşak', 'ibne', 'piç', 'aptal', 'salak', 'gerizekalı', 'amguard', 'orospuçocuğu'];
  for (const word of badWords) {
    // Kelime sınırı kontrolü veya doğrudan içerme
    if (cleanText.includes(word)) {
      return { flagged: true, reason: 'Hakaret veya uygunsuz dil (küfür/argo) içeriyor olabilir.' };
    }
  }

  return { flagged: false, reason: null };
}

/**
 * Gönderilen görüşü yapay zeka veya kural motoruyla tarayıp uyarı gerekçesi üretir.
 * @param {string} text - Görüş metni
 * @param {string} question - Masanın aktif sorusu (konu uyumluluğu için)
 * @returns {Promise<{flagged: boolean, reason: string|null}>}
 */
export async function evaluateOpinionContent(text, question) {
  if (!text || text.trim().length === 0) {
    return { flagged: true, reason: 'Görüş metni boş olamaz.' };
  }

  // OpenAI istemcisi yoksa doğrudan kural motoruna yönlendir
  if (!openaiClient) {
    return evaluateOpinionFallback(text);
  }

  try {
    const prompt = `
Aşağıdaki görüşün uygunluğunu müzakere konusu çerçevesinde değerlendir.

Müzakere Konusu/Sorusu: "${question}"
Gönderilen Görüş: "${text}"

Görevin: Bu görüşü 4 ana kritere göre değerlendir:
1. Hakaret, küfür, nefret söylemi veya saldırgan bir üslup var mı?
2. Reklam, spam, anlamsız karakter dizileri (örn. "asdasd") veya ilgisiz bağlantılar içeriyor mu?
3. Konuyla tamamen alakasız mı? (Örneğin bisiklet yolları konuşulurken futbol maçı sonucu yazmak). Not: Karşıt veya radikal fikirler konuyla alakalı olduğu sürece kesinlikle FLAGGED YAPILMAMALIDIR. İfade özgürlüğüne saygı duyulmalıdır.
4. Çok kısa veya tamamen anlamsız bir kelimeden mi ibaret?

Yanıt Formatı:
Sadece geçerli bir JSON objesi döndür. Başka hiçbir açıklama, markdown işareti veya kod bloğu ekleme.
Örnek Yanıt formatı:
{"flagged": true, "reason": "Buraya kısa bir Türkçe gerekçe yazın (max 10 kelime)."}
Eğer görüş tamamen uygunsa:
{"flagged": false, "reason": null}
`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen müzakere görüşlerini denetleyen, sadece JSON formatında yanıt veren objektif bir moderatör yardımcısısın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.1, // Düşük sıcaklık daha kararlı JSON çıktısı sağlar
    });

    const content = response.choices[0]?.message?.content?.trim();
    
    // JSON parse etmeye çalışalım, regex ile JSON bloklarını temizleyelim
    let jsonStr = content;
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(jsonStr);
    return {
      flagged: !!result.flagged,
      reason: result.reason || null
    };

  } catch (err) {
    console.warn('AI Görüş analizinde hata oluştu, fallback kural motoru devreye giriyor:', err.message);
    return evaluateOpinionFallback(text);
  }
}

