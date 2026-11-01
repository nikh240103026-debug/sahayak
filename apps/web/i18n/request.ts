import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Locale comes from a strictly necessary preference cookie (no URL prefix, no tracking). */
export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = value === "hi" ? "hi" : "en";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Asia/Kolkata",
  };
});
