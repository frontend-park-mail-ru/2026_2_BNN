export function formatJoined(iso: string): string {
  const date = new Date(iso);
  const month =
    new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" })
      .formatToParts(date)
      .find((part) => part.type === "month")?.value ?? "";

  return `В Brand New Notes с ${month} ${date.getFullYear()}`;
}
