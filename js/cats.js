// Categories, MCC mapping and automatic categorization.

// kind: exp = expense, inc = income, tr = transfer (excluded from stats)
// group: need / want (used for the 50/30/20 split)
export const DEFAULT_CATS = [
  { id: 'food', emoji: '🛒', ru: 'Продукты', en: 'Groceries', kind: 'exp', group: 'need' },
  { id: 'cafe', emoji: '☕', ru: 'Кафе и рестораны', en: 'Cafes & restaurants', kind: 'exp', group: 'want' },
  { id: 'delivery', emoji: '🛵', ru: 'Доставка еды', en: 'Food delivery', kind: 'exp', group: 'want' },
  { id: 'transport', emoji: '🚌', ru: 'Транспорт', en: 'Transport', kind: 'exp', group: 'need' },
  { id: 'car', emoji: '🚗', ru: 'Авто и топливо', en: 'Car & fuel', kind: 'exp', group: 'need' },
  { id: 'home', emoji: '🏠', ru: 'Жильё и коммуналка', en: 'Housing & utilities', kind: 'exp', group: 'need' },
  { id: 'telecom', emoji: '📱', ru: 'Связь и интернет', en: 'Phone & internet', kind: 'exp', group: 'need' },
  { id: 'subs', emoji: '🔁', ru: 'Подписки', en: 'Subscriptions', kind: 'exp', group: 'want' },
  { id: 'shop', emoji: '🛍️', ru: 'Покупки', en: 'Shopping', kind: 'exp', group: 'want' },
  { id: 'clothes', emoji: '👕', ru: 'Одежда и обувь', en: 'Clothing', kind: 'exp', group: 'want' },
  { id: 'tech', emoji: '💻', ru: 'Техника', en: 'Electronics', kind: 'exp', group: 'want' },
  { id: 'household', emoji: '🧺', ru: 'Дом и быт', en: 'Household', kind: 'exp', group: 'need' },
  { id: 'health', emoji: '💊', ru: 'Здоровье', en: 'Health', kind: 'exp', group: 'need' },
  { id: 'beauty', emoji: '💈', ru: 'Красота и уход', en: 'Beauty & care', kind: 'exp', group: 'want' },
  { id: 'sport', emoji: '🏋️', ru: 'Спорт', en: 'Sport', kind: 'exp', group: 'want' },
  { id: 'fun', emoji: '🎮', ru: 'Развлечения', en: 'Entertainment', kind: 'exp', group: 'want' },
  { id: 'travel', emoji: '✈️', ru: 'Путешествия', en: 'Travel', kind: 'exp', group: 'want' },
  { id: 'education', emoji: '📚', ru: 'Образование', en: 'Education', kind: 'exp', group: 'need' },
  { id: 'gifts', emoji: '🎁', ru: 'Подарки', en: 'Gifts', kind: 'exp', group: 'want' },
  { id: 'pets', emoji: '🐾', ru: 'Питомцы', en: 'Pets', kind: 'exp', group: 'need' },
  { id: 'fees', emoji: '🧾', ru: 'Налоги и комиссии', en: 'Taxes & fees', kind: 'exp', group: 'need' },
  { id: 'other_exp', emoji: '📦', ru: 'Другое', en: 'Other', kind: 'exp', group: 'want' },
  { id: 'salary', emoji: '💼', ru: 'Зарплата', en: 'Salary', kind: 'inc' },
  { id: 'freelance', emoji: '💡', ru: 'Подработка', en: 'Side income', kind: 'inc' },
  { id: 'cashback', emoji: '🎉', ru: 'Кешбэк', en: 'Cashback', kind: 'inc' },
  { id: 'income_other', emoji: '💰', ru: 'Другие доходы', en: 'Other income', kind: 'inc' },
  { id: 'transfer', emoji: '🔄', ru: 'Переводы', en: 'Transfers', kind: 'tr' },
  { id: 'cash', emoji: '🏧', ru: 'Снятие наличных', en: 'Cash withdrawal', kind: 'tr' },
  { id: 'savings', emoji: '🐷', ru: 'В копилку', en: 'To savings', kind: 'tr' },
];

const MCC_RANGES = [
  [[5411, 5412, 5422, 5441, 5451, 5462, 5499, 5331, 5297, 5298], 'food'],
  [[5811, 5812, 5813, 5814], 'cafe'],
  [[4111, 4112, 4121, 4131, 4789], 'transport'],
  [[5541, 5542, 5983, 5172, 7523, 7531, 7534, 7535, 7538, 7542, 7549, 5511, 5521, 5531, 5532, 5533, 5571, 5599, 7512, 7513], 'car'],
  [[4900, 6513, 7349], 'home'],
  [[4812, 4814, 4816, 4899], 'telecom'],
  [[5815, 5816, 5817, 5818, 5968, 7372], 'subs'],
  [[5300, 5309, 5310, 5311, 5399, 5964, 5965, 5969, 5999, 5931, 5932, 5933, 5937, 5949, 5950, 5970, 5971, 5972, 5973, 5978, 5993], 'shop'],
  [[5137, 5139, 5611, 5621, 5631, 5641, 5651, 5655, 5661, 5681, 5691, 5697, 5698, 5699, 5944, 5948], 'clothes'],
  [[4816, 5045, 5065, 5722, 5732, 5734, 5946, 7622], 'tech'],
  [[5039, 5072, 5200, 5211, 5231, 5251, 5261, 5712, 5713, 5714, 5718, 5719, 7210, 7211, 7216, 7217], 'household'],
  [[5122, 5912, 5975, 5976, 8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099], 'health'],
  [[5977, 7230, 7297, 7298], 'beauty'],
  [[5940, 5941, 7941, 7997, 7911], 'sport'],
  [[5735, 5942, 5945, 7832, 7841, 7922, 7929, 7932, 7933, 7991, 7992, 7993, 7994, 7995, 7996, 7998, 7999], 'fun'],
  [[4411, 4511, 4582, 4722, 7011, 7012, 7032, 7033], 'travel'],
  [[8211, 8220, 8241, 8244, 8249, 8299, 8351], 'education'],
  [[5947, 5992], 'gifts'],
  [[742, 5995], 'pets'],
  [[9211, 9222, 9223, 9311, 9399, 9402, 6300], 'fees'],
  [[6010, 6011], 'cash'],
  [[4829, 6012, 6050, 6051, 6538, 6540], 'transfer'],
];
const MCC = new Map();
for (const [codes, cat] of MCC_RANGES) for (const c of codes) if (!MCC.has(c)) MCC.set(c, cat);

export function catByMcc(mcc) {
  if (!mcc) return null;
  if (MCC.has(mcc)) return MCC.get(mcc);
  if (mcc >= 3000 && mcc <= 3299) return 'travel'; // airlines
  if (mcc >= 3351 && mcc <= 3441) return 'car'; // car rental
  if (mcc >= 3501 && mcc <= 3999) return 'travel'; // hotels
  return null;
}

// Keyword rules for statements without MCC (Privat24, Pekao, Revolut) and for bank category columns.
const KEYWORDS = [
  ['savings', ['на банку', 'банка «', 'банку «', 'з банки', 'копилк', 'скарбничк', 'vault', 'pocket', 'savings', 'oszczędn', 'skarbonk', 'депозит', 'deposit', 'lokata']],
  ['delivery', ['glovo', 'bolt food', 'wolt', 'uber eats', 'pyszne', 'raketa', 'ракета', 'доставка їжі', 'доставка еды', 'food delivery']],
  ['subs', ['netflix', 'spotify', 'youtube', 'apple.com', 'itunes', 'icloud', 'google one', 'google play', 'chatgpt', 'openai', 'anthropic', 'claude.ai', 'megogo', 'sweet.tv', 'sweet tv', 'playstation', 'xbox', 'disney', 'hbo', 'max.com', 'patreon', 'adobe', 'notion', 'canva', 'duolingo', 'tidal', 'deezer', 'kyivstar tv', 'tvp vod', 'canal+', 'player.pl', 'подписк', 'підписк', 'subscription', 'abonament']],
  ['food', ['сільпо', 'silpo', 'атб', 'atb', 'novus', 'новус', 'фора', 'fora', 'varus', 'варус', 'metro', 'ашан', 'auchan', 'біла кор', 'eko market', 'еко маркет', 'фуршет', 'brusnichka', 'близенько', 'thrash', 'траш', 'biedronka', 'lidl', 'żabka', 'zabka', 'kaufland', 'carrefour', 'netto', 'dino', 'aldi', 'stokrotka', 'lewiatan', 'polomarket', 'spar', 'groszek', 'delikatesy', 'supermarket', 'супермаркет', 'продукт', 'grocer', 'spożyw', 'piekarnia', 'пекарн', 'market']],
  ['cafe', ['mcdonald', 'kfc', 'starbucks', 'burger', 'pizza', 'піца', 'пицц', 'sushi', 'суші', 'суши', 'coffee', 'кава', 'кафе', 'cafe', 'café', 'kawiarnia', 'restaur', 'рестор', 'bar ', ' бар', 'pub', 'aroma kava', 'lviv croissants', 'пузата хата', 'kebab', 'bistro', 'kawa', 'costa', 'green caffe', 'pasibus', 'north fish']],
  ['transport', ['uber', 'bolt', 'uklon', 'уклон', 'jakdojade', 'mpk', 'ztm', 'pkp', 'intercity', 'koleje', 'укрзалізниц', 'ukrzaliznytsia', 'uz.gov', 'flixbus', 'метро', 'metropolitan', 'транспорт', 'transport', 'taxi', 'такси', 'таксі', 'bilet', 'квиток', 'skycash', 'freenow', 'free now', 'lime', 'tier', 'bus']],
  ['car', ['okko', 'окко', 'wog', 'orlen', 'shell', 'bp ', 'upg', 'socar', 'circle k', 'lotos', 'amic', 'avias', 'бренди', 'паливо', 'топливо', 'petrol', 'fuel', 'paliwo', 'азс', 'parking', 'паркінг', 'парковк', 'автомийк', 'car wash', 'myjnia', 'шиномонтаж', 'сто ', 'autoservice']],
  ['home', ['комунал', 'коммунал', 'оренда', 'аренда', 'rent', 'czynsz', 'najem', 'yasno', 'ясно', 'дтек', 'dtek', 'нафтогаз', 'naftogaz', 'газ', 'водоканал', 'tauron', 'pge', 'enea', 'energa', 'innogy', 'e.on', 'pgnig', 'osbb', 'осбб', 'utilities']],
  ['telecom', ['kyivstar', 'київстар', 'vodafone', 'водафон', 'lifecell', 'лайфсел', 'play ', 'orange', 'plus ', 't-mobile', 'heyah', 'virgin mobile', 'інтернет', 'internet', 'volia', 'воля', 'triolan', 'тріолан', 'datagroup', 'upc', 'vectra', 'мобільн', 'mobile']],
  ['clothes', ['zara', 'h&m', 'reserved', 'lpp', 'sinsay', 'cropp', 'house ', 'mohito', 'pull&bear', 'bershka', 'stradivarius', 'nike', 'adidas', 'puma', 'new balance', 'intertop', 'answear', 'zalando', 'ccc', 'deichmann', 'eobuwie', 'modivo', 'ecco', 'uniqlo', 'mango', 'massimo dutti', 'colin', 'одяг', 'одежд', 'взутт', 'обув', 'clothing', 'odzież']],
  ['tech', ['comfy', 'комфі', 'foxtrot', 'фокстрот', 'allo', 'алло', 'eldorado', 'ельдорадо', 'media expert', 'mediamarkt', 'media markt', 'rtv euro', 'x-kom', 'morele', 'komputronik', 'apple store', 'citrus', 'цитрус', 'moyo', 'мойо', 'техніка', 'техника', 'electronics']],
  ['household', ['ikea', 'epicentr', 'епіцентр', 'эпицентр', 'leroy', 'castorama', 'obi ', 'jysk', 'pepco', 'action', 'kik ', 'аврора', 'avrora', 'еva', 'eva ', 'наш край', 'rossmann', 'hebe', 'dm ', 'господар', 'household', 'dom ']],
  ['health', ['аптек', 'apteka', 'pharm', 'ліки', 'лекарств', 'doz', 'gemini', 'super-pharm', 'ziko', 'медичн', 'медицин', 'клінік', 'клиник', 'clinic', 'dental', 'стомат', 'lux med', 'luxmed', 'medicover', 'enel-med', 'добробут', 'лабор', 'diagnostic', 'synevo', 'сінево', 'health', 'zdrowie', 'lekarz']],
  ['beauty', ['барбер', 'barber', 'перукар', 'парикмах', 'fryzjer', 'салон', 'salon', 'beauty', 'manicure', 'манікюр', 'маникюр', 'sephora', 'notino', 'makeup', 'косметик', 'kosmetyk', 'prostor', 'watsons']],
  ['sport', ['sport', 'спорт', 'gym', 'fitness', 'фітнес', 'фитнес', 'decathlon', 'sportlife', 'zdrofit', 'benefit', 'multisport', 'basen', 'басейн', 'бассейн', 'calypso', 'jatomi', 'gymsport']],
  ['fun', ['steam', 'epic games', 'nintendo', 'кіно', 'кино', 'cinema', 'kino', 'multiplex', 'планета кіно', 'planeta kino', 'helios', 'cinema city', 'театр', 'theatre', 'teatr', 'концерт', 'concert', 'koncert', 'karabas', 'concert.ua', 'ticketmaster', 'ebilet', 'going.', 'bowling', 'боулінг', 'квест', 'музей', 'museum', 'muzeum', 'game', 'гра ', 'розваг', 'развлеч', 'entertainment', 'rozrywk']],
  ['travel', ['booking', 'airbnb', 'ryanair', 'wizz', 'lot ', 'mau', 'skyup', 'hotel', 'готел', 'отел', 'hostel', 'хостел', 'trip.com', 'expedia', 'travel', 'подорож', 'путешеств', 'podróż', 'airline', 'airport', 'аеропорт']],
  ['education', ['udemy', 'coursera', 'skillshare', 'prometheus', 'projector', 'курс', 'course', 'kurs', 'school', 'школ', 'university', 'університет', 'uczelnia', 'книг', 'book', 'książ', 'yakaboo', 'якабу', 'empik', 'osvita', 'освіт', 'образован', 'education', 'edukacja']],
  ['gifts', ['подарун', 'подар', 'gift', 'prezent', 'квіт', 'цвет', 'flower', 'kwiat', 'florist']],
  ['pets', ['зоо', 'zoo', 'pet', 'masterzoo', 'ветерин', 'vet', 'maxi zoo', 'kakadu', 'animal']],
  ['fees', ['комісі', 'комисси', 'fee', 'prowizja', 'opłata', 'податок', 'налог', 'tax', 'podatek', 'zus', 'штраф', 'mandat', 'держ', 'gov', 'страхув', 'страхов', 'insurance', 'ubezpiecz']],
  ['shop', ['rozetka', 'розетка', 'allegro', 'amazon', 'aliexpress', 'temu', 'shein', 'prom.ua', 'olx', 'nova poshta', 'нова пошта', 'meest', 'inpost', 'paczkomat', 'vinted', 'ebay', 'etsy', 'joom', 'покупк', 'shopping', 'zakupy', 'shop', 'магазин', 'sklep', 'store']],
  ['cash', ['банкомат', 'atm', 'bankomat', 'снят', 'зняття готів', 'wypłata gotówki', 'cash withdrawal', 'видача готів']],
  ['transfer', ['переказ', 'перевод', 'transfer', 'przelew', 'blik', 'p2p', 'з картки', 'на картку', 'с карты', 'на карту', 'поповнення', 'пополнен', 'top-up', 'topup', 'top up', 'exchange', 'обмін', 'обмен', 'конверт', 'wymiana', 'з гривневого', 'на гривневий', 'з чорної', 'з білої', 'власними рахунками', 'own account', 'własne']],
];

const INCOME_KEYWORDS = [
  ['salary', ['зарплат', 'заробітн', 'заработн', 'зп ', 'аванс', 'salary', 'payroll', 'wage', 'wynagrodzenie', 'pensja', 'wypłata']],
  ['cashback', ['кешбек', 'кэшбэк', 'кешбэк', 'cashback', 'cash back', 'бонус', 'bonus']],
  ['freelance', ['фоп', 'freelance', 'фриланс', 'фріланс', 'upwork', 'fiverr', 'payoneer', 'invoice', 'faktura']],
  ['savings', ['з банки', 'з копилк', 'from vault', 'from pocket', 'z oszczędności']],
  ['transfer', ['з гривневого', 'з чорної', 'з білої', 'власними рахунками', 'own account', 'top-up', 'topup', 'поповнення', 'пополнен', 'exchange', 'обмін', 'обмен', 'конверт', 'wymiana', 'własne']],
];

export function merchantKey(desc) {
  return String(desc || '')
    .toLowerCase()
    .replace(/[0-9#*№_]+/g, ' ')
    .replace(/[^\p{L}\s&.]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 3)
    .join(' ')
    .trim();
}

function matchKeywords(text, table) {
  const s = ' ' + text.toLowerCase() + ' ';
  for (const [cat, words] of table) for (const w of words) if (s.includes(w)) return cat;
  return null;
}

// rules: { merchantKey: catId } learned from the user's corrections
export function categorize({ desc = '', mcc = 0, amount = 0, bankCat = '' }, rules = {}) {
  const key = merchantKey(desc);
  if (key && rules[key]) return rules[key];
  const text = `${desc} ${bankCat}`;
  if (amount > 0) {
    const fromMcc = catByMcc(mcc);
    // refunds from a shop keep the shop's category
    if (fromMcc && !['transfer', 'cash'].includes(fromMcc)) return fromMcc;
    return matchKeywords(text, INCOME_KEYWORDS) || 'income_other';
  }
  return catByMcc(mcc) || matchKeywords(text, KEYWORDS) || 'other_exp';
}

export const GOAL_EMOJI = ['🎯', '🚗', '🏠', '✈️', '💻', '📱', '🛡️', '🎓', '💍', '🏍️', '🎸', '🏖️', '👶', '🐶', '💪', '🎁'];
export const CAT_EMOJI = ['🛒', '☕', '🍔', '🛵', '🚌', '🚗', '⛽', '🏠', '💡', '📱', '🔁', '🛍️', '👕', '👟', '💻', '🧺', '💊', '💈', '🏋️', '🎮', '🎬', '✈️', '📚', '🎁', '🐾', '🧾', '📦', '💼', '💡', '💰', '🎉', '🔄', '🏧', '🐷', '🍷', '🚬', '👶', '❤️', '⚽', '🎵'];
