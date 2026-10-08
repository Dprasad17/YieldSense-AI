import { useSyncExternalStore } from 'react';

/** Interface languages. Navigation, page titles and main actions are translated; detailed text stays in
 * English. The AI assistant answers in whatever language the question is written in. */
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];

const KEYS = [
  'Overview',
  'Intelligence',
  'Insights',
  'Data',
  'System',
  'Dashboard',
  'Yield Predictor',
  'Weather',
  'Soil',
  'Recommendations',
  'Risk assessment',
  'Ask YieldSense',
  'Market & revenue',
  'Leaf check',
  'Analytics & Reports',
  'EDA',
  'Farms',
  'Data collection',
  'Dataset Explorer',
  'Prediction history',
  'Model performance',
  'Notifications',
  'Users & roles',
  'Settings',
  'Help',
  'Predict yield',
  'Language',
] as const;
type Key = (typeof KEYS)[number];

const T: Record<Exclude<Lang, 'en'>, Partial<Record<Key, string>>> = {
  hi: {
    Overview: 'अवलोकन',
    Intelligence: 'इंटेलिजेंस',
    Insights: 'अंतर्दृष्टि',
    Data: 'डेटा',
    System: 'सिस्टम',
    Dashboard: 'डैशबोर्ड',
    'Yield Predictor': 'उपज अनुमान',
    Weather: 'मौसम',
    Soil: 'मिट्टी',
    Recommendations: 'सिफारिशें',
    'Risk assessment': 'जोखिम आकलन',
    'Ask YieldSense': 'YieldSense से पूछें',
    'Market & revenue': 'बाज़ार और आय',
    'Leaf check': 'पत्ती जाँच',
    'Analytics & Reports': 'विश्लेषण और रिपोर्ट',
    Farms: 'खेत',
    'Data collection': 'डेटा संग्रह',
    'Dataset Explorer': 'डेटासेट एक्सप्लोरर',
    'Prediction history': 'अनुमान इतिहास',
    'Model performance': 'मॉडल प्रदर्शन',
    Notifications: 'सूचनाएँ',
    'Users & roles': 'उपयोगकर्ता और भूमिकाएँ',
    Settings: 'सेटिंग्स',
    Help: 'सहायता',
    'Predict yield': 'उपज का अनुमान लगाएँ',
    Language: 'भाषा',
  },
  kn: {
    Overview: 'ಅವಲೋಕನ',
    Intelligence: 'ಬುದ್ಧಿಮತ್ತೆ',
    Insights: 'ಒಳನೋಟಗಳು',
    Data: 'ದತ್ತಾಂಶ',
    System: 'ವ್ಯವಸ್ಥೆ',
    Dashboard: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    'Yield Predictor': 'ಇಳುವರಿ ಮುನ್ಸೂಚನೆ',
    Weather: 'ಹವಾಮಾನ',
    Soil: 'ಮಣ್ಣು',
    Recommendations: 'ಶಿಫಾರಸುಗಳು',
    'Risk assessment': 'ಅಪಾಯ ಮೌಲ್ಯಮಾಪನ',
    'Ask YieldSense': 'YieldSense ಅನ್ನು ಕೇಳಿ',
    'Market & revenue': 'ಮಾರುಕಟ್ಟೆ ಮತ್ತು ಆದಾಯ',
    'Leaf check': 'ಎಲೆ ಪರೀಕ್ಷೆ',
    'Analytics & Reports': 'ವಿಶ್ಲೇಷಣೆ ಮತ್ತು ವರದಿಗಳು',
    Farms: 'ಜಮೀನುಗಳು',
    'Data collection': 'ದತ್ತಾಂಶ ಸಂಗ್ರಹ',
    'Dataset Explorer': 'ದತ್ತಾಂಶ ಪರಿಶೋಧಕ',
    'Prediction history': 'ಮುನ್ಸೂಚನೆ ಇತಿಹಾಸ',
    'Model performance': 'ಮಾದರಿ ಕಾರ್ಯಕ್ಷಮತೆ',
    Notifications: 'ಅಧಿಸೂಚನೆಗಳು',
    'Users & roles': 'ಬಳಕೆದಾರರು ಮತ್ತು ಪಾತ್ರಗಳು',
    Settings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    Help: 'ಸಹಾಯ',
    'Predict yield': 'ಇಳುವರಿ ಅಂದಾಜಿಸಿ',
    Language: 'ಭಾಷೆ',
  },
  te: {
    Overview: 'అవలోకనం',
    Intelligence: 'మేధస్సు',
    Insights: 'అంతర్దృష్టులు',
    Data: 'డేటా',
    System: 'సిస్టమ్',
    Dashboard: 'డ్యాష్‌బోర్డ్',
    'Yield Predictor': 'దిగుబడి అంచనా',
    Weather: 'వాతావరణం',
    Soil: 'నేల',
    Recommendations: 'సిఫార్సులు',
    'Risk assessment': 'ప్రమాద అంచనా',
    'Ask YieldSense': 'YieldSense ని అడగండి',
    'Market & revenue': 'మార్కెట్ & ఆదాయం',
    'Leaf check': 'ఆకు పరీక్ష',
    'Analytics & Reports': 'విశ్లేషణ & నివేదికలు',
    Farms: 'పొలాలు',
    'Data collection': 'డేటా సేకరణ',
    'Dataset Explorer': 'డేటాసెట్ ఎక్స్‌ప్లోరర్',
    'Prediction history': 'అంచనా చరిత్ర',
    'Model performance': 'మోడల్ పనితీరు',
    Notifications: 'నోటిఫికేషన్లు',
    'Users & roles': 'వినియోగదారులు & పాత్రలు',
    Settings: 'సెట్టింగ్‌లు',
    Help: 'సహాయం',
    'Predict yield': 'దిగుబడిని అంచనా వేయండి',
    Language: 'భాష',
  },
  ta: {
    Overview: 'மேலோட்டம்',
    Intelligence: 'நுண்ணறிவு',
    Insights: 'உள்ளுணர்வுகள்',
    Data: 'தரவு',
    System: 'அமைப்பு',
    Dashboard: 'டாஷ்போர்டு',
    'Yield Predictor': 'விளைச்சல் கணிப்பு',
    Weather: 'வானிலை',
    Soil: 'மண்',
    Recommendations: 'பரிந்துரைகள்',
    'Risk assessment': 'இடர் மதிப்பீடு',
    'Ask YieldSense': 'YieldSense-இடம் கேளுங்கள்',
    'Market & revenue': 'சந்தை & வருவாய்',
    'Leaf check': 'இலை சோதனை',
    'Analytics & Reports': 'பகுப்பாய்வு & அறிக்கைகள்',
    Farms: 'பண்ணைகள்',
    'Data collection': 'தரவு சேகரிப்பு',
    'Dataset Explorer': 'தரவுத்தொகுப்பு ஆய்வி',
    'Prediction history': 'கணிப்பு வரலாறு',
    'Model performance': 'மாதிரி செயல்திறன்',
    Notifications: 'அறிவிப்புகள்',
    'Users & roles': 'பயனர்கள் & பங்குகள்',
    Settings: 'அமைப்புகள்',
    Help: 'உதவி',
    'Predict yield': 'விளைச்சலைக் கணி',
    Language: 'மொழி',
  },
};

const STORAGE_KEY = 'ys-lang';
const listeners = new Set<() => void>();

function read(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some(l => l.code === v) ? (v as Lang) : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = typeof window === 'undefined' ? 'en' : read();

export function setLanguage(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // private mode: keep it for this session only
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  listeners.forEach(l => l());
}

export function getLanguage(): Lang {
  return current;
}

/** Translates an English UI string; unknown strings come back unchanged. */
export function translate(text: string, lang: Lang = current): string {
  if (lang === 'en') return text;
  return T[lang][text as Key] ?? text;
}

export function useLanguage(): [Lang, (t: string) => string] {
  const lang = useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 'en' as Lang,
  );
  return [lang, (t: string) => translate(t, lang)];
}

if (typeof document !== 'undefined') document.documentElement.lang = current;
