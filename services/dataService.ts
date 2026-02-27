import { ScoringResult, RegistrationData, ChatMessageData } from '../types';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

/**
 * Стандартизация номера: 79XXXXXXXXX
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '00000000000';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 0) return '00000000000';
  if (cleaned.startsWith('8')) {
    cleaned = '7' + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    cleaned = '7' + cleaned;
  }
  return cleaned.length > 11 ? cleaned.slice(-11) : cleaned;
}

/**
 * Однократная проверка системной записи при запуске.
 */
export async function performHeartbeat(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/quiz_results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        phone: '00000000000',
        first_name: 'System',
        personality_type: 'INITIALIZED',
        updated_at: new Date().toISOString()
      }),
    });
  } catch (e) {
    console.debug("Background ping");
  }
}

/**
 * Первичная регистрация пользователя (сохранение ФИО, телефона и пароля)
 */
export async function registerUser(user: RegistrationData): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  const cleanPhone = normalizePhoneNumber(user.phone);
  const payload = {
    phone: cleanPhone,
    first_name: user.firstName,
    last_name: user.lastName || '',
    password: user.password || '',
    age: parseInt(user.age) || 0,
    interests: user.interests || [],
    updated_at: new Date().toISOString()
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/quiz_results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=merge-duplicates' 
      },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    console.error("Registration error:", error);
    return false;
  }
}

/**
 * Обновление профиля пользователя (включая интересы) с использованием POST (Upsert)
 */
export async function updateUserProfile(user: RegistrationData): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const cleanPhone = normalizePhoneNumber(user.phone);
  
  // Отправляем полный payload для надежности (Upsert)
  const payload = {
    phone: cleanPhone,
    first_name: user.firstName,
    last_name: user.lastName || '',
    password: user.password || '',
    age: parseInt(user.age) || 0,
    interests: user.interests || [],
    updated_at: new Date().toISOString()
  };

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/quiz_results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=merge-duplicates' 
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Update profile error:", error);
  }
}

/**
 * Сохраняет результаты теста в Supabase (обновляет существующую запись).
 */
export async function saveResultToSpreadsheet(result: ScoringResult, user: RegistrationData): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  const cleanPhone = normalizePhoneNumber(user.phone);
  const payload = {
    phone: cleanPhone,
    first_name: user.firstName,
    last_name: user.lastName || '',
    password: user.password || '',
    age: parseInt(user.age) || 0,
    personality_type: result.type,
    ei_score: result.EI,
    sn_score: result.SN,
    ft_score: result.FT,
    jp_score: result.JP,
    interests: user.interests || [],
    updated_at: new Date().toISOString()
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/quiz_results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=merge-duplicates' 
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) return true;
    const errData = await response.json().catch(() => ({}));
    console.error("Supabase Save Error Details:", errData);
    return response.status === 409;
  } catch (error) {
    console.error("Network or parsing error during save:", error);
    return false;
  }
}

/**
 * Вход в систему: проверка ТЕЛЕФОНА и ПАРОЛЯ
 */
export async function loginUser(phone: string, password: string): Promise<{user: RegistrationData, result: ScoringResult, error?: string} | null> {
  const cleanPhone = normalizePhoneNumber(phone);
  const endpoint = `${SUPABASE_URL}/rest/v1/quiz_results?phone=eq.${encodeURIComponent(cleanPhone)}&select=*&limit=1`;
  
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    
    if (!data || data.length === 0) {
      return { error: 'Пользователь не найден. Пройдите тест, чтобы создать профиль.' } as any;
    }

    const dbRow = data[0];
    if (dbRow.password !== password) {
      return { error: 'Неверный пароль. Попробуйте снова.' } as any;
    }

    return {
      user: {
        firstName: dbRow.first_name,
        lastName: dbRow.last_name || '',
        phone: dbRow.phone,
        age: (dbRow.age || 0).toString(),
        interests: dbRow.interests || [],
        password: dbRow.password
      },
      result: dbRow.personality_type ? {
        type: dbRow.personality_type,
        EI: dbRow.ei_score,
        SN: dbRow.sn_score,
        FT: dbRow.ft_score,
        JP: dbRow.jp_score
      } : null as any
    };
  } catch (e) {
    console.error("Login attempt failed:", e);
    return null;
  }
}

export async function saveChatMessage(phone: string, role: 'user' | 'model', content: string): Promise<void> {
  const cleanPhone = normalizePhoneNumber(phone);
  if (cleanPhone === '00000000000') return;
  
  // При сохранении ответа модели добавляем тег нейтральности по умолчанию
  let finalContent = content;
  if (role === 'model') {
      finalContent = content + '[TAG:neutral]';
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/chat_history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ phone: cleanPhone, role, content: finalContent }),
    });
  } catch (e) {}
}

export async function getChatHistory(phone: string): Promise<ChatMessageData[]> {
  const cleanPhone = normalizePhoneNumber(phone);
  if (cleanPhone === '00000000000') return [];
  
  // Добавляем выбор поля created_at и id
  const endpoint = `${SUPABASE_URL}/rest/v1/chat_history?phone=eq.${encodeURIComponent(cleanPhone)}&select=id,role,content,created_at&order=created_at.asc&limit=3000`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!response.ok) return [];
    const data = await response.json();
    
    return data.map((d: any) => {
      let rating: 'like' | 'dislike' | undefined;
      let text = d.content || '';

      // Используем регулярное выражение для надежного поиска и удаления тега в конце строки,
      // даже если есть пробельные символы.
      const tagMatch = text.match(/\[TAG:(like|dislike|neutral)\]\s*$/);
      
      if (tagMatch) {
          const tag = tagMatch[1]; // like, dislike, or neutral
          if (tag === 'like') rating = 'like';
          if (tag === 'dislike') rating = 'dislike';
          // Если neutral - rating остается undefined
          
          // Удаляем тег из текста
          text = text.replace(/\[TAG:(like|dislike|neutral)\]\s*$/, '');
      } else {
        // Поддержка старых тегов для совместимости
        if (text.includes(' #liked')) {
            rating = 'like';
        } else if (text.includes(' #disliked')) {
            rating = 'dislike';
        }
        text = text.replace(/ #liked| #disliked| #neutral/g, '');
      }

      // Удаляем возможные пробелы в конце после удаления тега
      text = text.trimEnd();

      return { 
        id: d.id,
        role: d.role, 
        text: text,
        rating: rating,
        timestamp: d.created_at 
          ? new Date(d.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
          : undefined,
        createdAt: d.created_at
      };
    });
  } catch (e) {
    return [];
  }
}

/**
 * Обновляет рейтинг сообщения в БД.
 * Механика: находит сообщение, удаляет старые теги, добавляет новый (если выбран).
 */
export async function rateMessage(phone: string, message: ChatMessageData, rating: 'like' | 'dislike' | null): Promise<void> {
  const cleanPhone = normalizePhoneNumber(phone);
  if (cleanPhone === '00000000000') return;

  try {
    let recordId = message.id;
    let originalContent = message.text; 

    // 1. Если ID нет (сообщение только что отправлено и не перезагружено), ищем его
    if (!recordId) {
       const query = `${SUPABASE_URL}/rest/v1/chat_history?phone=eq.${encodeURIComponent(cleanPhone)}&role=eq.${message.role}&order=created_at.desc&limit=5`;
       const fetchResponse = await fetch(query, {
         headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
       });
       if (fetchResponse.ok) {
         const records = await fetchResponse.json();
         const found = records.find((r: any) => {
           // Очищаем контент из БД от тегов для сравнения с чистым текстом UI
           let cleanDb = r.content;
           cleanDb = cleanDb.replace(/\[TAG:(like|dislike|neutral)\]\s*$/, '');
           cleanDb = cleanDb.replace(/ #liked| #disliked| #neutral/g, '');
           cleanDb = cleanDb.trimEnd();
           return cleanDb === message.text;
         });
         if (found) {
           recordId = found.id;
           originalContent = found.content; 
         }
       }
    } else {
        const query = `${SUPABASE_URL}/rest/v1/chat_history?id=eq.${recordId}&select=content`;
        const fetchResponse = await fetch(query, {
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (fetchResponse.ok) {
            const data = await fetchResponse.json();
            if (data && data.length > 0) {
                originalContent = data[0].content;
            }
        }
    }

    if (!recordId) return;

    // 2. Очищаем контент от ЛЮБЫХ существующих тегов (новых и старых)
    let cleanContent = originalContent;
    cleanContent = cleanContent.replace(/\[TAG:(like|dislike|neutral)\]\s*$/, '');
    cleanContent = cleanContent.replace(/ #liked| #disliked| #neutral/g, '');
    cleanContent = cleanContent.trimEnd(); // Убираем возможные пробелы

    // 3. Формируем новый контент с тегом в конце
    let newSuffix = '[TAG:neutral]';
    if (rating === 'like') newSuffix = '[TAG:like]';
    if (rating === 'dislike') newSuffix = '[TAG:dislike]';
    
    // Не добавляем пробел перед тегом, чтобы сохранить чистоту данных, 
    // но при чтении регулярное выражение \s* учтет любые случайности.
    const newContent = cleanContent + newSuffix;

    // 4. Обновляем запись по ID
    await fetch(`${SUPABASE_URL}/rest/v1/chat_history?id=eq.${recordId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ content: newContent }),
    });

  } catch (e) {
    console.error("Error rating message:", e);
  }
}