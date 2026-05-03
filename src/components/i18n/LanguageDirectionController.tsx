import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useClient } from "@/contexts/ClientContext";

/**
 * Syncs i18next language and <html lang/dir> with the active client's
 * `language` (top-level column) and `direction` (top-level column, optional override).
 * Hebrew defaults to RTL; English to LTR. Explicit `direction` on clients wins.
 */
export function LanguageDirectionController() {
  const { i18n } = useTranslation();
  const { currentClient } = useClient();

  useEffect(() => {
    const lang = (currentClient?.language ?? "en").toLowerCase();
    const supported = lang === "he" ? "he" : "en";
    if (i18n.language !== supported) void i18n.changeLanguage(supported);

    const explicit = currentClient?.direction?.toLowerCase();
    const dir = explicit === "rtl" || explicit === "ltr" ? explicit : supported === "he" ? "rtl" : "ltr";

    document.documentElement.lang = supported;
    document.documentElement.dir = dir;
  }, [currentClient?.language, currentClient?.direction, i18n]);

  return null;
}
