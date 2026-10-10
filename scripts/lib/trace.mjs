/**
 * Parse a Chromium trace buffer ({"traceEvents":[ one event per line … ]}) without building one
 * giant string (long traces exceed V8's maximum string length). `keep(event)` filters while
 * parsing so only the events an analysis needs stay in memory.
 */
export function parseTrace(buf, keep = () => true) {
  const events = []
  let start = 0
  while (start < buf.length) {
    let end = buf.indexOf(10, start)
    if (end < 0) end = buf.length
    let line = buf.toString('utf8', start, end).trim()
    start = end + 1
    if (line.startsWith('{"traceEvents":[')) line = line.slice('{"traceEvents":['.length)
    if (line.endsWith(',')) line = line.slice(0, -1)
    if (!line.startsWith('{"')) continue
    let e
    try {
      e = JSON.parse(line)
    } catch {
      // the last event shares its line with the closing '],"metadata":…'
      const i = line.indexOf('}],"')
      if (i < 0) continue
      try {
        e = JSON.parse(line.slice(0, i + 1))
      } catch {
        continue
      }
    }
    if (keep(e)) events.push(e)
  }
  return events
}
