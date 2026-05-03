import { useFxConvert } from "@/hooks/useFxConvert";
import { useClient } from "@/contexts/ClientContext";

type Props = {
  amount: number | null | undefined;
  currency: string | null | undefined;
  /** When true, also render the converted value in the active client's display currency. */
  showConverted?: boolean;
  asOfDate?: string;
  className?: string;
};

function format(amount: number, currency: string, lang: string) {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function Money({ amount, currency, showConverted, asOfDate, className }: Props) {
  const { convert } = useFxConvert();
  const { currentClient } = useClient();
  const display = (currentClient?.base_currency ?? "USD").toUpperCase();
  const lang = (currentClient?.language ?? "en").toLowerCase();

  if (amount == null || !currency) return <span className={className}>—</span>;

  const native = format(amount, currency.toUpperCase(), lang);
  if (!showConverted || currency.toUpperCase() === display) {
    return <span className={className}>{native}</span>;
  }

  const converted = convert(amount, currency, display, asOfDate);
  return (
    <span className={className}>
      {native}
      {converted != null && (
        <span className="ms-1 text-muted-foreground">
          (≈ {format(converted, display, lang)})
        </span>
      )}
    </span>
  );
}
