/** Fade only the background of all-day entries so their text stays readable. */
export function calendarEventPaint(value: string, allDay: boolean) {
  const color = /^#[0-9a-f]{6}$/i.test(value) ? value : "#77818e";
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  const luminance = channels
    .map((channel) => {
      const component = channel / 255;
      return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, component, index) => sum + component * [0.2126, 0.7152, 0.0722][index], 0);
  const backgroundColor = allDay ? `rgba(${channels.join(", ")}, 0.5)` : color;
  return {
    backgroundColor,
    borderColor: backgroundColor,
    textColor: allDay ? "var(--text)" : luminance > 0.179 ? "#000000" : "#ffffff",
  };
}
