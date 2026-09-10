export function transcriptText(transcript, fallback = 'Speaker') {
  const segments = transcript?._segments;
  if (!segments?.length) return transcript?.text || '';
  return segments.map(segment => {
    const time = Number.isFinite(segment.start) && segment.start >= 0 ? `[${Math.floor(segment.start / 60)}:${String(Math.floor(segment.start % 60)).padStart(2, '0')}] ` : '';
    return `${time}${segment.speaker || fallback}: ${segment.text}`;
  }).join('\n\n');
}
