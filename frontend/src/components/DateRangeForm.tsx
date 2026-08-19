import { useState } from "react";

export function DateRangeForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (from: string, to: string) => void;
  isLoading: boolean;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(from, to);
      }}
    >
      <label htmlFor="from-date">
        Desde
        <input
          id="from-date"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          required
        />
      </label>
      <label htmlFor="to-date">
        Hasta
        <input
          id="to-date"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Generando..." : "Generar informe"}
      </button>
    </form>
  );
}
