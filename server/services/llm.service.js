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
