// Human-readable source locations shared by the concept atlas and its tests.
// PPTX source indices reuse the historic "page" field internally, but must never be presented as PDF pages.
export function sourcePointLabel(value, sourceType = 'pdf') {
  const isSlide = sourceType === 'pptx' || value && typeof value === 'object' && value.slide != null;
  const number = value && typeof value === 'object' ? (value.slide ?? value.page) : value;
  if (number == null || number === '') return isSlide ? 'slide not indexed' : 'page not indexed';
  return (isSlide ? 'slide ' : 'p. ') + number;
}

export function sourcePointsLabel(values, sourceType = 'pdf') {
  const points = (values || []).filter(x => x != null && x !== '');
  if (!points.length) return sourceType === 'pptx' ? 'slide not indexed' : 'page not indexed';
  return (sourceType === 'pptx' ? 'slides ' : 'p. ') + points.join(', ');
}

export function sourceRangeLabel(section, sourceType = 'pdf') {
  if (!section || section.startPage == null) return '';
  const start = section.startPage, end = section.endPage ?? start;
  if (sourceType === 'pptx') return start === end ? 'slide ' + start : 'slides ' + start + '–' + end;
  return start === end ? 'p. ' + start : 'pp. ' + start + '–' + end;
}
