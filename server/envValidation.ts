// A pasted API key sometimes picks up an invisible or wrong character from
// wherever it was copied — a "•" bullet from a masked "••••••" placeholder
// in some secrets UI, a smart quote, a non-breaking space, etc. When that
// corrupted string later gets used as an HTTP header value, fetch() throws a
// cryptic native error ("Cannot convert argument to a ByteString because the
// character at index N has a value of M which is greater than 255") that
// gives zero hint it's the API key that's broken. This turns it into an
// actionable message as early as possible, right where the key is about to
// be used as a header.
export function assertHeaderSafe(value: string, label: string): void {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 255) {
      throw new Error(
        `${label} contiene un carácter inválido (código ${code} en la posición ${i} — probablemente un símbolo ` +
        `como "•" o una comilla especial en vez del texto real). Vuelve a copiar la key completa desde su fuente ` +
        `original (Google Cloud Console / OpenAI) y pégala de nuevo, borrando el campo del secret por completo antes.`
      );
    }
  }
}
