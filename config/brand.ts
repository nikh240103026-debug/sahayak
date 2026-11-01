/**
 * The only place the product name and brand strings live.
 * Rename the product by editing this file; nothing else hardcodes it.
 */
export const brand = {
  name: "Sahayak",
  nameHi: "सहायक",
  tagline: {
    en: "We fill the forms. You make the decisions.",
    hi: "फ़ॉर्म हम भरते हैं। फ़ैसले आप लेते हैं।",
  },
  notAffiliated: {
    en: "Independent assistant. Not affiliated with, or endorsed by, any government body.",
    hi: "स्वतंत्र सहायक। किसी भी सरकारी संस्था से संबद्ध नहीं है और न ही उसके द्वारा समर्थित है।",
  },
  /** Replace with the registered legal entity before launch. */
  legalEntityName: "[LEGAL_ENTITY_NAME]",
  legalEntityAddress: "[LEGAL_ENTITY_ADDRESS]",
  grievanceOfficerName: "[GRIEVANCE_OFFICER_NAME]",
  jurisdictionCity: "[JURISDICTION_CITY]",
  demoPortal: {
    en: "Rajya Chhatravritti Demo Portal",
    hi: "राज्य छात्रवृत्ति डेमो पोर्टल",
    banner: "FICTIONAL DEMO PORTAL - NOT A GOVERNMENT WEBSITE",
  },
} as const;

export type Brand = typeof brand;
