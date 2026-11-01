/**
 * Legal page content in English and Hindi.
 *
 * These are TEMPLATES for a lawyer to review before launch. The legal pages
 * show a banner saying so. Nothing here is legal advice.
 *
 * Tokens replaced at render time:
 *   [LEGAL_ENTITY_NAME], [LEGAL_ENTITY_ADDRESS], [GRIEVANCE_OFFICER_NAME],
 *   [JURISDICTION_CITY], {grievanceEmail}, {supportEmail}, {retentionHours},
 *   {aiProvider}
 *
 * The product name is deliberately not written here; it lives only in
 * config/brand.ts.
 */

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  title: string;
  summary: string;
  sections: LegalSection[];
}

export type LegalSlug = "privacy" | "terms" | "disclaimer" | "ai-use";

export const LEGAL_UPDATED = "2026-11-01";

/* -------------------------------------------------------------------------- */
/* Privacy policy                                                             */
/* -------------------------------------------------------------------------- */

const privacyEn: LegalDoc = {
  title: "Privacy policy",
  summary:
    "We collect only what your chosen form needs, encrypt it, and delete your uploaded files after {retentionHours} hours. We show no ads and do no tracking. You can see, download, correct or delete your data anytime.",
  sections: [
    {
      heading: "Who we are",
      paragraphs: [
        "This service is run by [LEGAL_ENTITY_NAME], [LEGAL_ENTITY_ADDRESS]. In this policy, “we” and “us” mean [LEGAL_ENTITY_NAME]. Under India’s Digital Personal Data Protection Act, 2023 (the DPDP Act), we are the Data Fiduciary for the personal data you give us. That means we decide how it is used, and we are responsible for keeping it safe.",
        "We are an independent assistant. We are not affiliated with, or endorsed by, any government body. Using our service never means that a scheme will approve you, select you or pay you.",
        "In this build, the assistant works only on a fictional practice portal that comes with the service. Real government portals are switched off.",
      ],
    },
    {
      heading: "Adults only",
      paragraphs: [
        "This service is only for people aged 18 or older.",
        "We check your date of birth when you set up your account. If it shows you are under 18, we remove the sign-up and keep nothing.",
      ],
    },
    {
      heading: "Your three permissions",
      paragraphs: [
        "We ask for three separate permissions. You choose each one on its own. Giving any of them is optional, and withdrawing one is as easy as giving it: one switch on the Settings page.",
      ],
      bullets: [
        "Keep my profile. We store your confirmed details so we can fill forms for you. The service cannot work without this permission. If you withdraw it, we delete your saved profile.",
        "Read my documents with an AI model. Our AI provider reads your uploaded documents to suggest values, and helps when a portal page changes. If you say no, you type your details yourself, and the assistant still works.",
        "Let the assistant act on a portal for me. The assistant may fill an application on a portal for you. On top of this permission, we ask you to authorise each application separately before it starts.",
      ],
    },
    {
      heading: "How we record your choices",
      paragraphs: [
        "Every time you give or withdraw a permission, we record which permission it was, your choice, the version of the notice you saw, and the time. This record is append-only: we add new entries and never change old ones. It lets you, and us, show exactly what you agreed to and when.",
        "Withdrawing a permission stops any further use of your data that depends on it. It does not undo what was lawfully done before you withdrew.",
      ],
    },
    {
      heading: "What we collect",
      paragraphs: [
        "We ask only for what a form actually needs. If a scheme’s form does not ask for a detail, we do not ask you for it either. Here is what we may hold:",
      ],
      bullets: [
        "Your account email address.",
        "Your name and date of birth.",
        "Only the profile fields that the form for your chosen scheme needs. For example: father’s name, gender, category, mobile number, email, the district and state of your address, institution, course, marks, family income and income certificate number, bank account holder name, account number and IFSC, and the fictional Demo ID used on the practice portal.",
        "The documents you upload, such as your marksheet and income certificate.",
        "Screenshots of the portal pages the assistant works on, with sensitive fields masked.",
        "An audit log of every action the assistant took, with sensitive values masked.",
        "Receipts for the applications you submitted.",
      ],
    },
    {
      heading: "Why we use it",
      paragraphs: ["We use your data only for these purposes:"],
      bullets: [
        "To fill the applications you start, using only the details you confirmed.",
        "To check your details against a scheme’s published rules. This check uses fixed rules, not AI.",
        "To read your documents and suggest values, but only if you allowed AI reading.",
        "To show you what happened on the portal, through screenshots and the audit log, and to give you a receipt.",
        "To keep the service safe and fair, for example through a daily limit on applications for each person.",
        "To answer your questions, requests and grievances.",
        "To meet our duties under Indian law.",
      ],
    },
    {
      heading: "How we protect it",
      paragraphs: [
        "No system is perfectly safe. So we protect your data in several layers, and we keep as little as we can, for as short a time as we can:",
      ],
      bullets: [
        "Your profile and the values read from your documents are encrypted with AES-256-GCM inside our application, before they reach the database.",
        "Row-level security in our database means each account can reach only its own records.",
        "Your files are kept in private storage. They can be opened only through signed links that stop working after a short time.",
        "Every connection to our service is encrypted with TLS.",
        "Secret keys are kept only in our server environment, never in your browser.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: ["We keep your data only as long as it is needed:"],
      bullets: [
        "Uploaded documents and portal screenshots: deleted automatically after {retentionHours} hours.",
        "Your profile: until you withdraw the “Keep my profile” permission or delete your account.",
        "Receipts and audit logs: until you delete your account, so you can look back at what was submitted.",
      ],
    },
    {
      heading: "Download or delete your data",
      paragraphs: [
        "Anytime, from Settings, you can download everything we hold about you as a JSON file.",
        "You can also delete your account and all your data from Settings. This is a permanent deletion: we remove your records and your stored files, and they cannot be brought back.",
      ],
    },
    {
      heading: "Who else handles your data",
      paragraphs: [
        "We share your data only where it is needed to do what you asked, or where the law requires it:",
      ],
      bullets: [
        "Our AI provider, {aiProvider}, only if you gave the AI permission. See the next section.",
        "Our hosting, database and storage providers, which run the service for us and store and process data to do so.",
        "The portal you apply on, which receives the details and documents you approve. In this build, that is only the fictional practice portal, so nothing reaches a real office.",
        "Authorities, only when Indian law requires us to share.",
      ],
    },
    {
      heading: "AI and data outside India",
      paragraphs: [
        "If you give the AI permission, the text and images of your documents may be sent to our AI provider, {aiProvider}, which may process them outside India.",
        "With the same permission, the AI may also propose a single browser action when a portal page looks different from what we expected. For this, it sees only masked values for sensitive fields. It can never type a value you did not confirm.",
        "You can say no to this permission, or withdraw it later. You then type your details yourself, and the assistant still fills the form.",
        "Any transfer outside India follows the DPDP Act and any restrictions the Government of India notifies under it.",
      ],
    },
    {
      heading: "No Aadhaar",
      paragraphs: [
        "We do not collect Aadhaar numbers or Aadhaar OTPs.",
        "We reject files that show an Aadhaar number. We check text PDFs before saving them. If an image turns out to show an Aadhaar number, we delete it and do not use it.",
        "There is one limit we want you to know about. We cannot check an image on our own systems before the AI reads it, so an image could reach the AI provider before we spot the number. Please do not upload an Aadhaar card, or any document that shows an Aadhaar number.",
      ],
    },
    {
      heading: "Cookies and tracking",
      paragraphs: [
        "We show no advertising. We do no behavioural tracking. We use no third-party analytics and no tracking cookies.",
        "Our fonts are served from our own servers, so opening a page does not tell any font company about you.",
        "We use only strictly necessary cookies:",
      ],
      bullets: [
        "your sign-in session, so you stay signed in;",
        "your language and theme choice;",
        "the practice portal’s own session cookies, which it needs to work.",
      ],
    },
    {
      heading: "Your rights",
      paragraphs: [
        "Under India’s Digital Personal Data Protection Act, 2023 and the Digital Personal Data Protection Rules, 2025, you have the right to:",
      ],
      bullets: [
        "get a summary of the personal data we hold about you and how we use it (you can also download it from Settings);",
        "ask us to correct, complete or update your data;",
        "ask us to erase your data (you can also delete your account yourself from Settings);",
        "withdraw any permission, anytime, from Settings;",
        "have your grievances heard and answered;",
        "nominate a person to use these rights for you if you die or become unable to act yourself.",
      ],
    },
    {
      heading: "How to use your rights",
      paragraphs: [
        "Many rights work directly from Settings. For anything else, write to our Grievance Officer. We may ask you to confirm that the request really comes from you.",
        "If you are not satisfied with our answer, you can complain to the Data Protection Board of India. The law asks you to use our grievance channel first.",
      ],
    },
    {
      heading: "Grievance Officer",
      paragraphs: [
        "[GRIEVANCE_OFFICER_NAME], Grievance Officer, [LEGAL_ENTITY_NAME], [LEGAL_ENTITY_ADDRESS]. Email: {grievanceEmail}.",
        "We acknowledge every grievance within 24 hours. We aim to resolve it within 15 days, and if we need longer, we will tell you why.",
        "Please include your account email, what happened and when. Never send passwords, OTPs or Aadhaar numbers.",
        "For general help, write to {supportEmail}.",
      ],
    },
    {
      heading: "If there is a data breach",
      paragraphs: [
        "If a breach affects your personal data, we will tell you without delay: what happened, what it may mean for you, and what you can do to protect yourself. We will also inform the Data Protection Board of India, as the DPDP Rules require.",
        "We report cyber security incidents to CERT-In within the time it mandates.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: [
        "When we change this policy, we update the date at the top and the notice version. If a change affects a permission you gave, we will tell you, and ask you again where the law requires it.",
      ],
    },
  ],
};

const privacyHi: LegalDoc = {
  title: "प्राइवेसी पॉलिसी",
  summary:
    "हम सिर्फ़ वही जानकारी लेते हैं जो आपकी चुनी हुई योजना के फ़ॉर्म में चाहिए, उसे एन्क्रिप्ट करते हैं, और आपकी अपलोड की हुई फ़ाइलें {retentionHours} घंटे बाद डिलीट कर देते हैं। हम न विज्ञापन दिखाते हैं, न आपको ट्रैक करते हैं। आप कभी भी अपना डेटा देख, डाउनलोड कर, ठीक कर या डिलीट कर सकते हैं।",
  sections: [
    {
      heading: "हम कौन हैं",
      paragraphs: [
        "यह सेवा [LEGAL_ENTITY_NAME], [LEGAL_ENTITY_ADDRESS] चलाती है। इस पॉलिसी में “हम” का मतलब [LEGAL_ENTITY_NAME] है। भारत के डिजिटल वैयक्तिक डेटा संरक्षण अधिनियम, 2023 (DPDP Act) के तहत, आप हमें जो व्यक्तिगत डेटा देते हैं, उसके लिए हम “डेटा फ़िड्यूशरी” हैं। यानी उसका इस्तेमाल कैसे होगा, यह हम तय करते हैं, और उसे सुरक्षित रखने की ज़िम्मेदारी हमारी है।",
        "हम एक स्वतंत्र सहायक हैं। हम किसी भी सरकारी संस्था से जुड़े नहीं हैं, और न ही किसी सरकारी संस्था ने हमारा समर्थन किया है। हमारी सेवा इस्तेमाल करने का मतलब यह कभी नहीं है कि कोई योजना आपको मंज़ूरी देगी, आपका चयन करेगी या आपको पैसा देगी।",
        "इस वर्ज़न में सहायक सिर्फ़ एक काल्पनिक प्रैक्टिस पोर्टल पर काम करता है, जो इसी सेवा के साथ आता है। असली सरकारी पोर्टल बंद रखे गए हैं।",
      ],
    },
    {
      heading: "सिर्फ़ वयस्कों के लिए",
      paragraphs: [
        "यह सेवा सिर्फ़ 18 साल या उससे ज़्यादा उम्र के लोगों के लिए है।",
        "खाता सेट करते समय हम आपकी जन्मतिथि जाँचते हैं। अगर इससे पता चलता है कि आपकी उम्र 18 साल से कम है, तो हम साइन अप हटा देते हैं और कुछ भी नहीं रखते।",
      ],
    },
    {
      heading: "आपकी तीन अनुमतियाँ",
      paragraphs: [
        "हम तीन अलग-अलग अनुमतियाँ माँगते हैं। हर अनुमति आप अलग से चुनते हैं। कोई भी अनुमति देना आपकी मर्ज़ी है, और उसे वापस लेना उतना ही आसान है जितना देना: सेटिंग्स पेज पर बस एक स्विच।",
      ],
      bullets: [
        "मेरी प्रोफ़ाइल सेव रखें। हम आपकी पुष्टि की हुई जानकारी रखते हैं, ताकि आपके लिए फ़ॉर्म भर सकें। इस अनुमति के बिना सेवा काम नहीं कर सकती। अगर आप इसे वापस लेते हैं, तो हम आपकी सेव की हुई प्रोफ़ाइल डिलीट कर देते हैं।",
        "AI मॉडल से मेरे दस्तावेज़ पढ़ें। हमारा AI प्रोवाइडर आपके अपलोड किए दस्तावेज़ पढ़कर जानकारी सुझाता है, और पोर्टल का पेज बदलने पर मदद करता है। अगर आप मना करते हैं, तो आप अपनी जानकारी खुद टाइप करते हैं, और सहायक फिर भी काम करता है।",
        "सहायक को मेरी ओर से पोर्टल पर काम करने दें। सहायक आपके लिए पोर्टल पर आवेदन भर सकता है। इस अनुमति के अलावा, हर आवेदन शुरू होने से पहले हम आपसे उसकी अलग से अनुमति लेते हैं।",
      ],
    },
    {
      heading: "हम आपकी पसंद कैसे दर्ज करते हैं",
      paragraphs: [
        "जब भी आप कोई अनुमति देते हैं या वापस लेते हैं, हम दर्ज करते हैं कि कौन-सी अनुमति थी, आपने क्या चुना, आपने सूचना का कौन-सा वर्ज़न देखा, और कब। यह रिकॉर्ड सिर्फ़ आगे जुड़ता है (append-only): हम नई एंट्री जोड़ते हैं, पुरानी कभी नहीं बदलते। इससे आप और हम, दोनों ठीक-ठीक दिखा सकते हैं कि आपने किस बात पर कब सहमति दी।",
        "अनुमति वापस लेने पर, उस अनुमति पर टिका आपके डेटा का आगे का हर इस्तेमाल रुक जाता है। लेकिन वापस लेने से पहले जो काम कानून के हिसाब से हो चुका है, वह पलटता नहीं है।",
      ],
    },
    {
      heading: "हम क्या जानकारी लेते हैं",
      paragraphs: [
        "हम सिर्फ़ वही माँगते हैं जो फ़ॉर्म में सच में चाहिए। अगर किसी योजना का फ़ॉर्म कोई जानकारी नहीं माँगता, तो हम भी आपसे वह नहीं माँगते। हमारे पास यह जानकारी हो सकती है:",
      ],
      bullets: [
        "आपके खाते का ईमेल पता।",
        "आपका नाम और जन्मतिथि।",
        "प्रोफ़ाइल की सिर्फ़ वही जानकारी जो आपकी चुनी हुई योजना के फ़ॉर्म में चाहिए। जैसे: पिता का नाम, लिंग, श्रेणी (कैटेगरी), मोबाइल नंबर, ईमेल, पते का ज़िला और राज्य, संस्थान, कोर्स, अंक, परिवार की आय और आय प्रमाण पत्र का नंबर, बैंक खाताधारक का नाम, खाता नंबर और IFSC, और प्रैक्टिस पोर्टल पर इस्तेमाल होने वाली काल्पनिक Demo ID।",
        "आपके अपलोड किए दस्तावेज़, जैसे मार्कशीट और आय प्रमाण पत्र।",
        "सहायक जिन पोर्टल पेजों पर काम करता है, उनके स्क्रीनशॉट, जिनमें संवेदनशील जानकारी छिपी होती है।",
        "सहायक के हर काम का ऑडिट लॉग, जिसमें संवेदनशील जानकारी छिपी होती है।",
        "आपके जमा किए गए आवेदनों की रसीदें।",
      ],
    },
    {
      heading: "हम इसका इस्तेमाल क्यों करते हैं",
      paragraphs: ["हम आपके डेटा का इस्तेमाल सिर्फ़ इन कामों के लिए करते हैं:"],
      bullets: [
        "आपके शुरू किए आवेदन भरने के लिए, सिर्फ़ उसी जानकारी से जिसकी आपने पुष्टि की है।",
        "आपकी जानकारी को योजना के प्रकाशित नियमों से मिलाने के लिए। यह जाँच तय नियमों से होती है, AI से नहीं।",
        "आपके दस्तावेज़ पढ़कर जानकारी सुझाने के लिए, लेकिन सिर्फ़ तब जब आपने AI से पढ़ने की अनुमति दी हो।",
        "स्क्रीनशॉट और ऑडिट लॉग के ज़रिए आपको दिखाने के लिए कि पोर्टल पर क्या हुआ, और आपको रसीद देने के लिए।",
        "सेवा को सुरक्षित और सबके लिए सही रखने के लिए, जैसे हर व्यक्ति के लिए रोज़ के आवेदनों की एक सीमा।",
        "आपके सवालों, अनुरोधों और शिकायतों का जवाब देने के लिए।",
        "भारतीय कानून के तहत अपनी ज़िम्मेदारियाँ पूरी करने के लिए।",
      ],
    },
    {
      heading: "हम इसे कैसे सुरक्षित रखते हैं",
      paragraphs: [
        "कोई भी सिस्टम पूरी तरह सुरक्षित नहीं होता। इसलिए हम आपके डेटा को कई परतों में सुरक्षित रखते हैं, और जितना हो सके कम डेटा, जितना हो सके कम समय के लिए रखते हैं:",
      ],
      bullets: [
        "आपकी प्रोफ़ाइल और आपके दस्तावेज़ों से पढ़ी गई जानकारी, डेटाबेस तक पहुँचने से पहले ही, हमारे ऐप्लिकेशन के अंदर AES-256-GCM से एन्क्रिप्ट की जाती है।",
        "हमारे डेटाबेस में रो-लेवल सिक्योरिटी (row-level security) है, यानी हर खाता सिर्फ़ अपने ही रिकॉर्ड तक पहुँच सकता है।",
        "आपकी फ़ाइलें प्राइवेट स्टोरेज में रहती हैं। उन्हें सिर्फ़ ऐसे साइन किए हुए (signed) लिंक से खोला जा सकता है जो थोड़ी देर में काम करना बंद कर देते हैं।",
        "हमारी सेवा से होने वाला हर कनेक्शन TLS से एन्क्रिप्ट होता है।",
        "गुप्त चाबियाँ (secret keys) सिर्फ़ हमारे सर्वर पर रहती हैं, आपके ब्राउज़र में कभी नहीं।",
      ],
    },
    {
      heading: "हम इसे कब तक रखते हैं",
      paragraphs: ["हम आपका डेटा सिर्फ़ तब तक रखते हैं जब तक उसकी ज़रूरत है:"],
      bullets: [
        "अपलोड किए गए दस्तावेज़ और पोर्टल के स्क्रीनशॉट: {retentionHours} घंटे बाद अपने आप डिलीट।",
        "आपकी प्रोफ़ाइल: जब तक आप “मेरी प्रोफ़ाइल सेव रखें” अनुमति वापस नहीं लेते या अपना खाता डिलीट नहीं करते।",
        "रसीदें और ऑडिट लॉग: जब तक आप अपना खाता डिलीट नहीं करते, ताकि आप बाद में देख सकें कि क्या जमा हुआ था।",
      ],
    },
    {
      heading: "अपना डेटा डाउनलोड या डिलीट करें",
      paragraphs: [
        "आप कभी भी, सेटिंग्स से, वह सब कुछ JSON फ़ाइल के रूप में डाउनलोड कर सकते हैं जो हमारे पास आपके बारे में है।",
        "आप सेटिंग्स से अपना खाता और अपना सारा डेटा भी डिलीट कर सकते हैं। यह हमेशा के लिए डिलीट होता है: हम आपके रिकॉर्ड और आपकी रखी हुई फ़ाइलें हटा देते हैं, और उन्हें वापस नहीं लाया जा सकता।",
      ],
    },
    {
      heading: "आपका डेटा और कौन संभालता है",
      paragraphs: [
        "हम आपका डेटा सिर्फ़ वहीं साझा करते हैं जहाँ आपका कहा हुआ काम करने के लिए ज़रूरी हो, या जहाँ कानून ऐसा माँगे:",
      ],
      bullets: [
        "हमारा AI प्रोवाइडर, {aiProvider}, सिर्फ़ तब जब आपने AI की अनुमति दी हो। इसके बारे में अगला हिस्सा पढ़ें।",
        "हमारे होस्टिंग, डेटाबेस और स्टोरेज प्रोवाइडर, जो हमारे लिए सेवा चलाते हैं और इसके लिए डेटा रखते और प्रोसेस करते हैं।",
        "वह पोर्टल जिस पर आप आवेदन करते हैं। उसे वही जानकारी और दस्तावेज़ मिलते हैं जिन्हें आप मंज़ूरी देते हैं। इस वर्ज़न में यह सिर्फ़ काल्पनिक प्रैक्टिस पोर्टल है, इसलिए किसी असली दफ़्तर तक कुछ नहीं पहुँचता।",
        "सरकारी अधिकारी, सिर्फ़ तब जब भारतीय कानून हमसे ऐसा करने को कहे।",
      ],
    },
    {
      heading: "AI और भारत के बाहर डेटा",
      paragraphs: [
        "अगर आप AI की अनुमति देते हैं, तो आपके दस्तावेज़ों का टेक्स्ट और उनकी तस्वीरें हमारे AI प्रोवाइडर, {aiProvider}, को भेजी जा सकती हैं, जो उन्हें भारत के बाहर प्रोसेस कर सकता है।",
        "इसी अनुमति से, जब पोर्टल का कोई पेज हमारी उम्मीद से अलग दिखता है, तो AI ब्राउज़र में करने के लिए एक अकेला कदम भी सुझा सकता है। इसके लिए उसे संवेदनशील जानकारी सिर्फ़ छिपे हुए (masked) रूप में दिखती है। वह कभी भी ऐसी कोई जानकारी नहीं भर सकता जिसकी आपने पुष्टि न की हो।",
        "आप यह अनुमति देने से मना कर सकते हैं, या बाद में वापस ले सकते हैं। तब आप अपनी जानकारी खुद टाइप करते हैं, और सहायक फिर भी फ़ॉर्म भरता है।",
        "भारत के बाहर कोई भी ट्रांसफ़र DPDP Act और उसके तहत भारत सरकार की ओर से जारी किसी भी पाबंदी के अनुसार होता है।",
      ],
    },
    {
      heading: "आधार नहीं",
      paragraphs: [
        "हम आधार नंबर या आधार OTP नहीं लेते।",
        "जिन फ़ाइलों में आधार नंबर दिखता है, उन्हें हम स्वीकार नहीं करते। टेक्स्ट वाली PDF को हम सेव करने से पहले जाँचते हैं। अगर बाद में पता चलता है कि किसी तस्वीर में आधार नंबर है, तो हम उसे डिलीट कर देते हैं और उसका इस्तेमाल नहीं करते।",
        "एक सीमा है, जिसके बारे में हम चाहते हैं कि आप जानें। AI के पढ़ने से पहले हम किसी तस्वीर को अपने सिस्टम पर नहीं जाँच सकते, इसलिए हो सकता है कि नंबर पकड़ में आने से पहले वह तस्वीर AI प्रोवाइडर तक पहुँच जाए। कृपया आधार कार्ड या ऐसा कोई दस्तावेज़ अपलोड न करें जिसमें आधार नंबर दिखता हो।",
      ],
    },
    {
      heading: "कुकीज़ और ट्रैकिंग",
      paragraphs: [
        "हम कोई विज्ञापन नहीं दिखाते। हम आपके व्यवहार को ट्रैक नहीं करते। हम किसी तीसरी कंपनी का एनालिटिक्स या कोई ट्रैकिंग कुकी इस्तेमाल नहीं करते।",
        "हमारे फ़ॉन्ट हमारे अपने सर्वर से आते हैं, इसलिए पेज खुलने पर किसी फ़ॉन्ट कंपनी को आपके बारे में पता नहीं चलता।",
        "हम सिर्फ़ बहुत ज़रूरी कुकीज़ इस्तेमाल करते हैं:",
      ],
      bullets: [
        "आपका साइन-इन सेशन, ताकि आप साइन इन रहें;",
        "आपकी भाषा और थीम की पसंद;",
        "प्रैक्टिस पोर्टल की अपनी सेशन कुकीज़, जिनके बिना वह काम नहीं करता।",
      ],
    },
    {
      heading: "आपके अधिकार",
      paragraphs: [
        "भारत के डिजिटल वैयक्तिक डेटा संरक्षण अधिनियम, 2023 और डिजिटल वैयक्तिक डेटा संरक्षण नियम, 2025 के तहत आपको ये अधिकार हैं:",
      ],
      bullets: [
        "हमारे पास आपका जो व्यक्तिगत डेटा है और हम उसका इस्तेमाल कैसे करते हैं, उसका सारांश पाना (आप इसे सेटिंग्स से डाउनलोड भी कर सकते हैं);",
        "अपना डेटा ठीक करवाना, पूरा करवाना या अपडेट करवाना;",
        "अपना डेटा मिटवाना (आप सेटिंग्स से खुद भी अपना खाता डिलीट कर सकते हैं);",
        "कोई भी अनुमति, कभी भी, सेटिंग्स से वापस लेना;",
        "अपनी शिकायत सुनी जाना और उसका जवाब पाना;",
        "किसी व्यक्ति को नामित करना, जो आपकी मृत्यु होने पर या आपके खुद काम न कर पाने की हालत में आपकी ओर से इन अधिकारों का इस्तेमाल करे।",
      ],
    },
    {
      heading: "अपने अधिकारों का इस्तेमाल कैसे करें",
      paragraphs: [
        "कई अधिकार सीधे सेटिंग्स से काम करते हैं। बाकी किसी भी चीज़ के लिए हमारे शिकायत अधिकारी को लिखें। हम आपसे यह पुष्टि करने को कह सकते हैं कि अनुरोध सच में आपकी ओर से है।",
        "अगर आप हमारे जवाब से संतुष्ट नहीं हैं, तो आप भारतीय डेटा संरक्षण बोर्ड (Data Protection Board of India) में शिकायत कर सकते हैं। कानून के मुताबिक, पहले आपको हमारे शिकायत वाले रास्ते का इस्तेमाल करना होता है।",
      ],
    },
    {
      heading: "शिकायत अधिकारी",
      paragraphs: [
        "[GRIEVANCE_OFFICER_NAME], शिकायत अधिकारी, [LEGAL_ENTITY_NAME], [LEGAL_ENTITY_ADDRESS]। ईमेल: {grievanceEmail}।",
        "हर शिकायत मिलने की पुष्टि हम 24 घंटे के अंदर करते हैं। हमारी कोशिश रहती है कि 15 दिनों के अंदर उसका हल कर दें, और अगर ज़्यादा समय चाहिए, तो हम आपको वजह बताएँगे।",
        "कृपया अपने खाते का ईमेल, क्या हुआ और कब हुआ, यह ज़रूर लिखें। पासवर्ड, OTP या आधार नंबर कभी न भेजें।",
        "सामान्य मदद के लिए {supportEmail} पर लिखें।",
      ],
    },
    {
      heading: "अगर डेटा ब्रीच हो जाए",
      paragraphs: [
        "अगर किसी ब्रीच (डेटा की सुरक्षा में सेंध) का असर आपके व्यक्तिगत डेटा पर पड़ता है, तो हम आपको बिना देर किए बताएँगे: क्या हुआ, आपके लिए इसका क्या मतलब हो सकता है, और अपनी सुरक्षा के लिए आप क्या कर सकते हैं। DPDP नियमों के मुताबिक, हम भारतीय डेटा संरक्षण बोर्ड को भी सूचना देंगे।",
        "साइबर सुरक्षा से जुड़ी घटनाओं की रिपोर्ट हम CERT-In को उसकी तय की गई समय-सीमा के अंदर करते हैं।",
      ],
    },
    {
      heading: "इस पॉलिसी में बदलाव",
      paragraphs: [
        "जब हम इस पॉलिसी में बदलाव करते हैं, तो ऊपर दी गई तारीख और सूचना का वर्ज़न बदल देते हैं। अगर किसी बदलाव का असर आपकी दी हुई किसी अनुमति पर पड़ता है, तो हम आपको बताएँगे, और जहाँ कानून कहता है, वहाँ आपसे फिर से अनुमति माँगेंगे।",
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Terms of use                                                               */
/* -------------------------------------------------------------------------- */

const termsEn: LegalDoc = {
  title: "Terms of use",
  summary:
    "These terms are the agreement between you and [LEGAL_ENTITY_NAME]. In short: use the assistant only for yourself, give true information, check everything before you approve, and remember that we are a helper, not the government.",
  sections: [
    {
      heading: "About these terms",
      paragraphs: [
        "These terms apply when you use this website and its assistant, run by [LEGAL_ENTITY_NAME], [LEGAL_ENTITY_ADDRESS]. When you create an account, you agree to them.",
        "Please read them together with our Privacy policy, Disclaimer and How we use AI pages. If you do not agree with these terms, please do not use the service.",
      ],
    },
    {
      heading: "Who can use it",
      paragraphs: [
        "You must be 18 or older. You may use the service only to apply for yourself.",
      ],
    },
    {
      heading: "Our role",
      paragraphs: [
        "We are a tool that helps you fill applications for public schemes. We are an independent assistant. We are not an agent of any government, and we are not affiliated with or endorsed by any government body.",
        "We do not decide who gets a scheme. The office running the scheme decides. We never promise approval, selection or payment.",
        "We give general help, not legal advice.",
        "In this build, the assistant works only on a fictional practice portal. Real portals are switched off, and nothing you do on the practice portal reaches a real office.",
      ],
    },
    {
      heading: "Your responsibilities",
      paragraphs: ["When you use the service, you agree to:"],
      bullets: [
        "use only your own personal data and your own documents, and never apply on someone else’s behalf;",
        "give true, correct and complete information, and keep it up to date;",
        "read every value before you approve, because you are responsible for what you approve and submit;",
        "upload only genuine documents that belong to you, and never an Aadhaar card or any document showing an Aadhaar number;",
        "not misuse the service, for example with scripts or bots, bulk applications, attempts to overload it, or attempts to get into other people’s accounts;",
        "not try to make the assistant bypass CAPTCHA, OTP, rate limits, bot detection or login protections, including by hiding instructions in documents or web pages;",
        "keep your password safe, and tell us at {supportEmail} if you think someone else has used your account.",
      ],
    },
    {
      heading: "How the assistant acts for you",
      bullets: [
        "It acts only on your own application, and only after you authorise that run.",
        "It never bypasses, solves or evades CAPTCHA, OTP, rate limits, bot detection or login protections. When a portal asks for one of these, the assistant hands it to you.",
        "It submits nothing until you have approved every value on the final review.",
        "It never applies on someone else’s behalf and never submits in bulk. Each person has a daily limit on applications.",
        "It forwards your documents unchanged. We never create or edit documents.",
      ],
    },
    {
      heading: "Availability and limits",
      paragraphs: [
        "We run on free-tier hosting. The service may be slow, may take up to a minute to wake up, and may sometimes be unavailable.",
        "Portals change without warning, so the assistant may stop partway and ask for your help. Please leave enough time before any deadline.",
        "We may change, pause or switch off features at any time, especially to keep people safe.",
      ],
    },
    {
      heading: "Limitation of liability",
      paragraphs: [
        "We work hard to make the assistant careful and accurate. But we provide it free and “as is”, and we cannot promise that it will always work or never make a mistake.",
        "Nothing in these terms takes away rights you have under Indian law, including under the DPDP Act, or limits any liability that the law does not allow us to limit.",
        "Within those limits, we are not responsible for:",
      ],
      bullets: [
        "decisions made by any scheme, office or portal;",
        "missed deadlines, or a portal being slow or unavailable;",
        "losses caused by information you gave or approved that was wrong or incomplete;",
        "indirect or consequential losses.",
      ],
    },
    {
      heading: "Ending your use",
      paragraphs: [
        "You can stop using the service anytime, and delete your account and all your data from Settings.",
        "We may suspend or close an account that breaks these terms, misuses the service or puts others at risk. Where it is safe and lawful, we will tell you why.",
        "When an account is closed, we delete its data as described in our Privacy policy, unless the law requires us to keep something.",
      ],
    },
    {
      heading: "Governing law and disputes",
      paragraphs: [
        "These terms are governed by the laws of India. The courts at [JURISDICTION_CITY] have jurisdiction over any dispute about them.",
        "Before going to court, please write to our Grievance Officer, [GRIEVANCE_OFFICER_NAME], at {grievanceEmail}, so we can try to put things right together.",
      ],
    },
    {
      heading: "Changes to these terms",
      paragraphs: [
        "We may update these terms. When we do, we change the date at the top. For important changes, we will show you a notice on the website before they take effect.",
        "If you keep using the service after a change takes effect, the new terms apply. If you do not agree, you can delete your account anytime.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        "General help: {supportEmail}. Grievances: [GRIEVANCE_OFFICER_NAME], Grievance Officer, {grievanceEmail}.",
      ],
    },
  ],
};

const termsHi: LegalDoc = {
  title: "इस्तेमाल की शर्तें",
  summary:
    "ये शर्तें आपके और [LEGAL_ENTITY_NAME] के बीच का समझौता हैं। छोटे में: सहायक का इस्तेमाल सिर्फ़ अपने लिए करें, सच्ची जानकारी दें, मंज़ूरी देने से पहले सब कुछ जाँचें, और याद रखें कि हम एक मददगार हैं, सरकार नहीं।",
  sections: [
    {
      heading: "इन शर्तों के बारे में",
      paragraphs: [
        "ये शर्तें तब लागू होती हैं जब आप यह वेबसाइट और इसका सहायक इस्तेमाल करते हैं, जिसे [LEGAL_ENTITY_NAME], [LEGAL_ENTITY_ADDRESS] चलाती है। खाता बनाते ही आप इन शर्तों को मान लेते हैं।",
        "कृपया इन्हें हमारी प्राइवेसी पॉलिसी, डिस्क्लेमर और “हम AI का इस्तेमाल कैसे करते हैं” पेज के साथ पढ़ें। अगर आप इन शर्तों से सहमत नहीं हैं, तो कृपया सेवा का इस्तेमाल न करें।",
      ],
    },
    {
      heading: "कौन इस्तेमाल कर सकता है",
      paragraphs: [
        "आपकी उम्र 18 साल या उससे ज़्यादा होनी चाहिए। आप इस सेवा का इस्तेमाल सिर्फ़ अपने लिए आवेदन करने में कर सकते हैं।",
      ],
    },
    {
      heading: "हमारी भूमिका",
      paragraphs: [
        "हम एक टूल हैं जो सरकारी योजनाओं के आवेदन भरने में आपकी मदद करता है। हम एक स्वतंत्र सहायक हैं। हम किसी सरकार के एजेंट नहीं हैं, और न ही किसी सरकारी संस्था से जुड़े हैं या उसके द्वारा समर्थित हैं।",
        "किसे योजना का लाभ मिलेगा, यह हम तय नहीं करते। यह योजना चलाने वाला दफ़्तर तय करता है। हम मंज़ूरी, चयन या भुगतान का वादा कभी नहीं करते।",
        "हम सामान्य मदद देते हैं, कानूनी सलाह नहीं।",
        "इस वर्ज़न में सहायक सिर्फ़ एक काल्पनिक प्रैक्टिस पोर्टल पर काम करता है। असली पोर्टल बंद हैं, और प्रैक्टिस पोर्टल पर आप जो भी करते हैं, वह किसी असली दफ़्तर तक नहीं पहुँचता।",
      ],
    },
    {
      heading: "आपकी ज़िम्मेदारियाँ",
      paragraphs: ["सेवा का इस्तेमाल करते हुए आप इन बातों पर सहमत होते हैं:"],
      bullets: [
        "आप सिर्फ़ अपना व्यक्तिगत डेटा और अपने दस्तावेज़ इस्तेमाल करेंगे, और कभी किसी और की ओर से आवेदन नहीं करेंगे;",
        "आप सच्ची, सही और पूरी जानकारी देंगे, और उसे अपडेट रखेंगे;",
        "मंज़ूरी देने से पहले आप हर जानकारी पढ़ेंगे, क्योंकि आप जो मंज़ूर करते हैं और जमा करते हैं, उसकी ज़िम्मेदारी आपकी है;",
        "आप सिर्फ़ अपने असली दस्तावेज़ अपलोड करेंगे, और कभी आधार कार्ड या ऐसा कोई दस्तावेज़ नहीं जिसमें आधार नंबर दिखता हो;",
        "आप सेवा का गलत इस्तेमाल नहीं करेंगे, जैसे स्क्रिप्ट या बॉट चलाना, थोक में आवेदन करना, सेवा पर ज़रूरत से ज़्यादा बोझ डालने की कोशिश करना, या दूसरों के खातों में घुसने की कोशिश करना;",
        "आप सहायक से CAPTCHA, OTP, रेट लिमिट, बॉट की पहचान या लॉगिन सुरक्षा को बायपास करवाने की कोशिश नहीं करेंगे, दस्तावेज़ों या वेब पेजों में निर्देश छिपाकर भी नहीं;",
        "आप अपना पासवर्ड सुरक्षित रखेंगे, और अगर आपको लगे कि किसी और ने आपका खाता इस्तेमाल किया है, तो {supportEmail} पर हमें बताएँगे।",
      ],
    },
    {
      heading: "सहायक आपके लिए कैसे काम करता है",
      bullets: [
        "यह सिर्फ़ आपके अपने आवेदन पर काम करता है, और तभी जब आप उस बार के लिए अनुमति देते हैं।",
        "यह CAPTCHA, OTP, रेट लिमिट, बॉट की पहचान या लॉगिन सुरक्षा को कभी बायपास नहीं करता, न उन्हें हल करता है, न उनसे बचने की कोशिश करता है। जब पोर्टल इनमें से कुछ माँगता है, तो सहायक उसे आपको सौंप देता है।",
        "जब तक आप आख़िरी जाँच में हर जानकारी को मंज़ूरी नहीं देते, यह कुछ भी जमा नहीं करता।",
        "यह कभी किसी और की ओर से आवेदन नहीं करता और कभी थोक में आवेदन जमा नहीं करता। हर व्यक्ति के लिए रोज़ के आवेदनों की एक सीमा है।",
        "यह आपके दस्तावेज़ बिना बदले आगे भेजता है। हम कभी कोई दस्तावेज़ न बनाते हैं, न बदलते हैं।",
      ],
    },
    {
      heading: "सेवा की उपलब्धता और सीमाएँ",
      paragraphs: [
        "हम मुफ़्त (free-tier) होस्टिंग पर चलते हैं। सेवा धीमी हो सकती है, शुरू होने में एक मिनट तक ले सकती है, और कभी-कभी उपलब्ध नहीं भी हो सकती।",
        "पोर्टल बिना बताए बदल जाते हैं, इसलिए सहायक बीच में रुककर आपसे मदद माँग सकता है। कृपया किसी भी आख़िरी तारीख से पहले काफ़ी समय रखें।",
        "हम कभी भी सुविधाओं को बदल, रोक या बंद कर सकते हैं, ख़ासकर लोगों की सुरक्षा के लिए।",
      ],
    },
    {
      heading: "हमारी ज़िम्मेदारी की सीमा",
      paragraphs: [
        "हम पूरी मेहनत करते हैं कि सहायक सावधान और सटीक रहे। लेकिन हम इसे मुफ़्त और “जैसा है वैसा” (as is) देते हैं, और यह वादा नहीं कर सकते कि यह हमेशा काम करेगा या कभी गलती नहीं करेगा।",
        "इन शर्तों में कुछ भी भारतीय कानून के तहत आपके अधिकार नहीं छीनता, जिनमें DPDP Act के अधिकार भी शामिल हैं। और न ही यह उस ज़िम्मेदारी को सीमित करता है जिसे सीमित करने की इजाज़त कानून नहीं देता।",
        "इन सीमाओं के अंदर, हम इनके लिए ज़िम्मेदार नहीं हैं:",
      ],
      bullets: [
        "किसी योजना, दफ़्तर या पोर्टल के फ़ैसले;",
        "छूटी हुई आख़िरी तारीखें, या किसी पोर्टल का धीमा या बंद होना;",
        "आपकी दी हुई या मंज़ूर की हुई गलत या अधूरी जानकारी से हुआ नुकसान;",
        "अप्रत्यक्ष नुकसान, या ऐसे नुकसान जो किसी दूसरे नुकसान के नतीजे में हुए हों।",
      ],
    },
    {
      heading: "सेवा का इस्तेमाल बंद करना",
      paragraphs: [
        "आप कभी भी सेवा का इस्तेमाल बंद कर सकते हैं, और सेटिंग्स से अपना खाता और सारा डेटा डिलीट कर सकते हैं।",
        "जो खाता इन शर्तों को तोड़ता है, सेवा का गलत इस्तेमाल करता है या दूसरों को ख़तरे में डालता है, उसे हम रोक या बंद कर सकते हैं। जहाँ ऐसा करना सुरक्षित और कानूनी हो, हम आपको वजह बताएँगे।",
        "खाता बंद होने पर हम उसका डेटा हमारी प्राइवेसी पॉलिसी में बताए तरीके से डिलीट करते हैं, जब तक कि कानून हमें कुछ रखने को न कहे।",
      ],
    },
    {
      heading: "लागू कानून और विवाद",
      paragraphs: [
        "ये शर्तें भारत के कानूनों के तहत हैं। इनसे जुड़े किसी भी विवाद पर [JURISDICTION_CITY] की अदालतों का अधिकार क्षेत्र होगा।",
        "अदालत जाने से पहले, कृपया हमारे शिकायत अधिकारी, [GRIEVANCE_OFFICER_NAME], को {grievanceEmail} पर लिखें, ताकि हम मिलकर बात सुलझाने की कोशिश कर सकें।",
      ],
    },
    {
      heading: "इन शर्तों में बदलाव",
      paragraphs: [
        "हम इन शर्तों को अपडेट कर सकते हैं। ऐसा होने पर हम ऊपर दी गई तारीख बदल देते हैं। बड़े बदलावों के लिए, लागू होने से पहले हम वेबसाइट पर आपको सूचना दिखाएँगे।",
        "बदलाव लागू होने के बाद भी अगर आप सेवा का इस्तेमाल करते रहते हैं, तो नई शर्तें लागू होंगी। अगर आप सहमत नहीं हैं, तो आप कभी भी अपना खाता डिलीट कर सकते हैं।",
      ],
    },
    {
      heading: "संपर्क",
      paragraphs: [
        "सामान्य मदद: {supportEmail}। शिकायतें: [GRIEVANCE_OFFICER_NAME], शिकायत अधिकारी, {grievanceEmail}।",
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Disclaimer                                                                 */
/* -------------------------------------------------------------------------- */

const disclaimerEn: LegalDoc = {
  title: "Disclaimer",
  summary:
    "We are an independent helper, not the government. We cannot guarantee any result, the portal in this build is fictional, and nothing here is legal or financial advice. Always check official sources.",
  sections: [
    {
      heading: "Not a government service",
      paragraphs: [
        "This assistant is run by [LEGAL_ENTITY_NAME]. It is independent. It is not affiliated with, or endorsed by, any government body, and nothing on this website is an official government notice.",
      ],
    },
    {
      heading: "No guarantee of any result",
      paragraphs: [
        "We cannot promise that an application will be approved, that you will be selected, or that you will be paid. Only the office running the scheme decides.",
        "Our eligibility check compares your details with the scheme’s published rules as we have written them down. Rules change, and our check can be wrong or out of date. It does not bind the office running the scheme.",
        "A receipt shows only that the portal received an application.",
      ],
    },
    {
      heading: "The practice portal is fictional",
      paragraphs: [
        "The portal in this build is a fictional practice portal. It is not a government website. Applications made there go nowhere, and no real scheme, office or payment is involved.",
        "Real portals are switched off in this build.",
      ],
    },
    {
      heading: "Not legal or financial advice",
      paragraphs: [
        "We give general help only. Nothing on this website is legal, financial or tax advice. For advice about your own situation, please talk to a qualified professional or to the office running the scheme.",
      ],
    },
    {
      heading: "Check official sources",
      bullets: [
        "Read the official scheme notice and the official portal before you apply.",
        "Check the deadlines yourself, and apply early. Our service may be slow or unavailable at times.",
        "If what we show and an official source differ, follow the official source.",
        "Keep your own copy of everything you submit, and of your receipt.",
      ],
    },
  ],
};

const disclaimerHi: LegalDoc = {
  title: "डिस्क्लेमर",
  summary:
    "हम एक स्वतंत्र मददगार हैं, सरकार नहीं। हम किसी नतीजे की गारंटी नहीं दे सकते, इस वर्ज़न का पोर्टल काल्पनिक है, और यहाँ कुछ भी कानूनी या वित्तीय सलाह नहीं है। हमेशा आधिकारिक स्रोत ज़रूर देखें।",
  sections: [
    {
      heading: "यह सरकारी सेवा नहीं है",
      paragraphs: [
        "यह सहायक [LEGAL_ENTITY_NAME] चलाती है। यह स्वतंत्र है। यह किसी भी सरकारी संस्था से जुड़ा नहीं है और न ही उसके द्वारा समर्थित है, और इस वेबसाइट पर कुछ भी सरकार की आधिकारिक सूचना नहीं है।",
      ],
    },
    {
      heading: "किसी नतीजे की गारंटी नहीं",
      paragraphs: [
        "हम यह वादा नहीं कर सकते कि कोई आवेदन मंज़ूर होगा, आपका चयन होगा, या आपको पैसा मिलेगा। यह सिर्फ़ योजना चलाने वाला दफ़्तर तय करता है।",
        "हमारी योग्यता जाँच आपकी जानकारी को योजना के प्रकाशित नियमों से मिलाती है, जैसे हमने उन्हें लिखा है। नियम बदलते रहते हैं, और हमारी जाँच गलत या पुरानी हो सकती है। योजना चलाने वाला दफ़्तर हमारी जाँच मानने के लिए बाध्य नहीं है।",
        "रसीद सिर्फ़ यह दिखाती है कि पोर्टल को आवेदन मिल गया है।",
      ],
    },
    {
      heading: "प्रैक्टिस पोर्टल काल्पनिक है",
      paragraphs: [
        "इस वर्ज़न का पोर्टल एक काल्पनिक प्रैक्टिस पोर्टल है। यह सरकारी वेबसाइट नहीं है। वहाँ किए गए आवेदन कहीं नहीं जाते, और उनमें कोई असली योजना, दफ़्तर या भुगतान शामिल नहीं होता।",
        "इस वर्ज़न में असली पोर्टल बंद हैं।",
      ],
    },
    {
      heading: "कानूनी या वित्तीय सलाह नहीं",
      paragraphs: [
        "हम सिर्फ़ सामान्य मदद देते हैं। इस वेबसाइट पर कुछ भी कानूनी, वित्तीय या टैक्स से जुड़ी सलाह नहीं है। अपनी स्थिति के बारे में सलाह के लिए, कृपया किसी योग्य जानकार से या योजना चलाने वाले दफ़्तर से बात करें।",
      ],
    },
    {
      heading: "आधिकारिक स्रोत ज़रूर देखें",
      bullets: [
        "आवेदन करने से पहले योजना की आधिकारिक सूचना और आधिकारिक पोर्टल पढ़ें।",
        "आख़िरी तारीखें खुद जाँचें, और जल्दी आवेदन करें। हमारी सेवा कभी-कभी धीमी या बंद हो सकती है।",
        "अगर हमारी बताई बात और किसी आधिकारिक स्रोत में फ़र्क हो, तो आधिकारिक स्रोत की बात मानें।",
        "आप जो भी जमा करें, उसकी और अपनी रसीद की एक कॉपी अपने पास रखें।",
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* How we use AI                                                              */
/* -------------------------------------------------------------------------- */

const aiUseEn: LegalDoc = {
  title: "How we use AI",
  summary:
    "We use AI for two jobs only, and only with your permission: reading your documents, and suggesting one corrective step when a portal page looks different. AI never decides whether you qualify, never types a value you did not confirm, never answers a CAPTCHA or OTP, and never submits without your approval.",
  sections: [
    {
      heading: "When we use AI",
      paragraphs: [
        "We use AI only if you turned on the permission “Read my documents with an AI model”. With it, AI does two jobs:",
      ],
      bullets: [
        "Reading your documents. The AI reads the documents you upload, such as your marksheet and income certificate, and suggests values for your profile. You check each value, correct it if needed, and confirm it. We use only the values you confirm.",
        "Suggesting one step when a page is different. Portals sometimes change: a button moves, or a new pop-up appears. When that happens, the AI may propose a single browser action, such as which button to click, so the assistant can carry on.",
      ],
    },
    {
      heading: "What AI never does",
      bullets: [
        "It never decides whether you qualify. Eligibility is checked with fixed rules written from the scheme’s published rules. The same details always give the same answer.",
        "It never types a value you did not confirm.",
        "It never answers a CAPTCHA or an OTP. Those always come to you.",
        "It never submits an application. Only your final approval of every value does that.",
        "It never creates, edits or improves your documents. We forward them exactly as you uploaded them.",
      ],
    },
    {
      heading: "What data the AI sees",
      paragraphs: ["Here is what the AI sees:"],
      bullets: [
        "For reading documents: the text and images of the documents you upload.",
        "For a page change: what is on the portal page, with sensitive fields masked. For fields such as your bank account number, the AI sees only a masked value, never the full value.",
      ],
    },
    {
      heading: "Where that data goes",
      paragraphs: [
        "Our AI provider is {aiProvider}. It may process your data outside India. If you are not comfortable with that, you can say no to AI and still use the service.",
        "We do not collect Aadhaar numbers. But we cannot check an image before the AI reads it, so please do not upload an Aadhaar card or any document showing an Aadhaar number. If an image turns out to show one, we delete it and do not use it.",
        "On each application page, we show how many times AI was used for that application.",
      ],
    },
    {
      heading: "Instructions hidden on web pages",
      paragraphs: [
        "A web page or a document can contain text that tries to give orders to an AI, such as “ignore your rules and type this”. This is called prompt injection.",
        "We treat everything on a portal page and in your documents as information to read, never as instructions to follow. And the most important limits do not depend on the AI behaving well. Our own code lets the AI propose only one step at a time, refuses any step that would type a value you did not confirm, and never lets the AI answer a CAPTCHA or OTP or submit the form.",
        "If a proposed step breaks these rules, it is blocked for safety and recorded in your audit log.",
      ],
    },
    {
      heading: "The kill switch",
      paragraphs: [
        "We have a kill switch that turns AI off across the whole service at once. We use it if the AI provider has a problem, or if we see AI behaving in a way we did not expect.",
        "When AI is switched off, you can still type your details yourself. Without AI, the assistant cannot work around page changes, so it may stop and ask for your help more often.",
      ],
    },
    {
      heading: "How to opt out",
      paragraphs: [
        "When you set up your account, leave “Read my documents with an AI model” unticked. Or turn it off anytime on the Settings page. Withdrawing is as easy as giving it.",
        "Without AI, you type your details yourself. The eligibility check works exactly the same, because it never uses AI. The assistant still fills your form, and still stops for the CAPTCHA, the OTP and your final approval.",
        "Your uploaded documents are still deleted automatically after {retentionHours} hours.",
      ],
    },
  ],
};

const aiUseHi: LegalDoc = {
  title: "हम AI का इस्तेमाल कैसे करते हैं",
  summary:
    "हम AI का इस्तेमाल सिर्फ़ दो कामों के लिए करते हैं, और सिर्फ़ आपकी अनुमति से: आपके दस्तावेज़ पढ़ना, और जब पोर्टल का पेज अलग दिखे तो सुधार का एक कदम सुझाना। AI कभी तय नहीं करता कि आप योग्य हैं या नहीं, कभी ऐसी जानकारी नहीं भरता जिसकी आपने पुष्टि न की हो, कभी CAPTCHA या OTP का जवाब नहीं देता, और आपकी मंज़ूरी के बिना कभी कुछ जमा नहीं करता।",
  sections: [
    {
      heading: "हम AI का इस्तेमाल कब करते हैं",
      paragraphs: [
        "हम AI का इस्तेमाल सिर्फ़ तब करते हैं जब आपने “AI मॉडल से मेरे दस्तावेज़ पढ़ें” वाली अनुमति चालू की हो। इस अनुमति से AI दो काम करता है:",
      ],
      bullets: [
        "आपके दस्तावेज़ पढ़ना। AI आपके अपलोड किए दस्तावेज़, जैसे मार्कशीट और आय प्रमाण पत्र, पढ़ता है और आपकी प्रोफ़ाइल के लिए जानकारी सुझाता है। आप हर जानकारी जाँचते हैं, ज़रूरत हो तो ठीक करते हैं, और उसकी पुष्टि करते हैं। हम सिर्फ़ वही जानकारी इस्तेमाल करते हैं जिसकी आपने पुष्टि की है।",
        "पेज अलग दिखने पर एक कदम सुझाना। पोर्टल कभी-कभी बदल जाते हैं: कोई बटन अपनी जगह से हट जाता है, या कोई नया पॉप-अप आ जाता है। ऐसा होने पर AI ब्राउज़र में करने के लिए एक अकेला कदम सुझा सकता है, जैसे कौन-सा बटन दबाना है, ताकि सहायक आगे बढ़ सके।",
      ],
    },
    {
      heading: "AI क्या कभी नहीं करता",
      bullets: [
        "यह कभी तय नहीं करता कि आप योग्य हैं या नहीं। योग्यता की जाँच तय नियमों से होती है, जो योजना के प्रकाशित नियमों से लिखे गए हैं। एक जैसी जानकारी पर हमेशा एक जैसा जवाब आता है।",
        "यह कभी ऐसी कोई जानकारी नहीं भरता जिसकी आपने पुष्टि न की हो।",
        "यह कभी CAPTCHA या OTP का जवाब नहीं देता। ये हमेशा आपके पास आते हैं।",
        "यह कभी आवेदन जमा नहीं करता। यह सिर्फ़ तब होता है जब आप हर जानकारी को आख़िरी मंज़ूरी देते हैं।",
        "यह कभी आपके दस्तावेज़ न बनाता है, न बदलता है, न सुधारता है। हम उन्हें बिल्कुल वैसे ही आगे भेजते हैं जैसे आपने अपलोड किए थे।",
      ],
    },
    {
      heading: "AI को कौन-सा डेटा दिखता है",
      paragraphs: ["AI को यह दिखता है:"],
      bullets: [
        "दस्तावेज़ पढ़ने के लिए: आपके अपलोड किए दस्तावेज़ों का टेक्स्ट और तस्वीरें।",
        "पेज बदलने पर: पोर्टल के पेज पर जो है, वह, लेकिन संवेदनशील जानकारी छिपाकर। आपके बैंक खाता नंबर जैसी जानकारी AI को कभी पूरी नहीं दिखती, सिर्फ़ उसका छिपा हुआ (masked) रूप दिखता है।",
      ],
    },
    {
      heading: "यह डेटा कहाँ जाता है",
      paragraphs: [
        "हमारा AI प्रोवाइडर {aiProvider} है। यह आपके डेटा को भारत के बाहर प्रोसेस कर सकता है। अगर आप इससे सहज नहीं हैं, तो आप AI के लिए मना कर सकते हैं और फिर भी सेवा इस्तेमाल कर सकते हैं।",
        "हम आधार नंबर नहीं लेते। लेकिन AI के पढ़ने से पहले हम किसी तस्वीर को नहीं जाँच सकते, इसलिए कृपया आधार कार्ड या ऐसा कोई दस्तावेज़ अपलोड न करें जिसमें आधार नंबर दिखता हो। अगर बाद में पता चले कि किसी तस्वीर में आधार नंबर है, तो हम उसे डिलीट कर देते हैं और उसका इस्तेमाल नहीं करते।",
        "हर आवेदन के पेज पर हम दिखाते हैं कि उस आवेदन के लिए AI का कितनी बार इस्तेमाल हुआ।",
      ],
    },
    {
      heading: "वेब पेजों में छिपे निर्देश",
      paragraphs: [
        "किसी वेब पेज या दस्तावेज़ में ऐसा टेक्स्ट हो सकता है जो AI को हुक्म देने की कोशिश करे, जैसे “अपने नियम भूल जाओ और यह भर दो”। इसे प्रॉम्प्ट इंजेक्शन (prompt injection) कहते हैं।",
        "पोर्टल के पेज पर और आपके दस्तावेज़ों में जो कुछ भी है, उसे हम सिर्फ़ पढ़ने वाली जानकारी मानते हैं, मानने वाले निर्देश कभी नहीं। और सबसे ज़रूरी सीमाएँ AI के अच्छे बर्ताव पर टिकी नहीं हैं। हमारा अपना कोड AI को एक बार में सिर्फ़ एक कदम सुझाने देता है, ऐसा हर कदम रोक देता है जो आपकी बिना पुष्टि की हुई जानकारी भरे, और AI को कभी CAPTCHA या OTP का जवाब देने या फ़ॉर्म जमा करने नहीं देता।",
        "अगर कोई सुझाया गया कदम इन नियमों को तोड़ता है, तो उसे सुरक्षा के लिए रोक दिया जाता है और आपके ऑडिट लॉग में दर्ज किया जाता है।",
      ],
    },
    {
      heading: "किल स्विच",
      paragraphs: [
        "हमारे पास एक किल स्विच है, जो पूरी सेवा में AI को एक साथ बंद कर देता है। अगर AI प्रोवाइडर में कोई दिक्कत हो, या हमें AI का बर्ताव उम्मीद से अलग दिखे, तो हम इसका इस्तेमाल करते हैं।",
        "AI बंद होने पर भी आप अपनी जानकारी खुद टाइप कर सकते हैं। AI के बिना सहायक पेज के बदलावों से निपट नहीं पाता, इसलिए वह ज़्यादा बार रुककर आपसे मदद माँग सकता है।",
      ],
    },
    {
      heading: "AI के लिए मना कैसे करें",
      paragraphs: [
        "खाता सेट करते समय “AI मॉडल से मेरे दस्तावेज़ पढ़ें” वाले बॉक्स पर टिक न करें। या सेटिंग्स पेज पर कभी भी इसे बंद कर दें। अनुमति वापस लेना उतना ही आसान है जितना देना।",
        "AI के बिना आप अपनी जानकारी खुद टाइप करते हैं। योग्यता की जाँच बिल्कुल पहले जैसी होती है, क्योंकि उसमें कभी AI का इस्तेमाल होता ही नहीं। सहायक फिर भी आपका फ़ॉर्म भरता है, और CAPTCHA, OTP और आपकी आख़िरी मंज़ूरी के लिए फिर भी रुकता है।",
        "आपके अपलोड किए दस्तावेज़ फिर भी {retentionHours} घंटे बाद अपने आप डिलीट हो जाते हैं।",
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */

export const legal: Record<LegalSlug, { en: LegalDoc; hi: LegalDoc }> = {
  privacy: { en: privacyEn, hi: privacyHi },
  terms: { en: termsEn, hi: termsHi },
  disclaimer: { en: disclaimerEn, hi: disclaimerHi },
  "ai-use": { en: aiUseEn, hi: aiUseHi },
};
