import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useClient } from "@/contexts/ClientContext";

type FxRow = {
  base_currency: string;
  quote_currency: string;
  rate: number;
  rate_date: string; // YYYY-MM-DD
};

/**
 * Display-time FX conversion. Native currency stored on every row stays native;
 * this is only for aggregations and "show in my preferred currency" displays.
 *
 * Picks the most recent rate on or before `asOfDate` (defaults to today).
 * Tries direct (from→to), then inverse (to→from), then USD-pivot.
 */
export function useFxConvert() {
  const { currentClientId } = useClient();

  const { data: rates } = useQuery({
    queryKey: ["fx-rates", currentClientId],
    enabled: !!currentClientId,
    queryFn: async (): Promise<FxRow[]> => {
      // Pull a recent slice; tune as data grows.
      const { data, error } = await supabase
        .from("fx_rates")
        .select("base_currency, quote_currency, rate, rate_date")
        .order("rate_date", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as FxRow[];
    },
  });

  const findRate = useCallback(
    (from: string, to: string, asOf: string): number | null => {
      if (!rates || rates.length === 0) return null;
      if (from === to) return 1;

      const onOrBefore = (b: string, q: string) =>
        rates.find((r) => r.base_currency === b && r.quote_currency === q && r.rate_date <= asOf);

      const direct = onOrBefore(from, to);
      if (direct) return Number(direct.rate);

      const inverse = onOrBefore(to, from);
      if (inverse && Number(inverse.rate) !== 0) return 1 / Number(inverse.rate);

      // USD pivot
      const fromUsd = onOrBefore(from, "USD") ?? (onOrBefore("USD", from) ? null : null);
      const usdTo = onOrBefore("USD", to);
      if (fromUsd && usdTo) return Number(fromUsd.rate) * Number(usdTo.rate);
      const fromToUsdInv = onOrBefore("USD", from);
      if (fromToUsdInv && usdTo && Number(fromToUsdInv.rate) !== 0) {
        return (1 / Number(fromToUsdInv.rate)) * Number(usdTo.rate);
      }

      return null;
    },
    [rates]
  );

  const convert = useCallback(
    (amount: number, from: string, to: string, asOfDate?: string): number | null => {
      const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
      const rate = findRate(from.toUpperCase(), to.toUpperCase(), asOf);
      if (rate == null) return null;
      return amount * rate;
    },
    [findRate]
  );

  return { convert, ratesLoaded: !!rates };
}
