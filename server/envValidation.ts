// A pasted API key sometimes picks up an invisible or wrong character from
// wherever it was copied — a "•" bullet from a masked "••••••" placeholder
// in some secrets UI, a smart quote, a non-breaking space, etc. When that
// corrupted string later gets used as an HTTP header value, fetch() throws a
// cryptic native error ("Cannot convert argument to a ByteString because the
// character at index N has a value of M which is greater than 255") that
// gives zero hint it's the API key that's broken. This turns it into an
// actionable message as early as possible, right where the key is about to
// be used as a header.
// Several routes accept an API key from more than one possible env var name
// (e.g. GOOGLE_PLACES_API_KEY, falling back to VITE_GOOGLE_MAPS_API_KEY).
// Reporting "GOOGLE_PLACES_API_KEY / VITE_GOOGLE_MAPS_API_KEY contains an
// invalid character" leaves the reader guessing which ONE actually needs
// fixing — this returns which specific name actually supplied the value, so
// error messages (and assertHeaderSafe) can name it precisely.
export function resolveEnvVar(names: string[]): { value: string; name: string } | null {
  for (const name of names) {
    const value = process.env[name];
    if (value) return { value, name };
  }
  return null;
}

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
