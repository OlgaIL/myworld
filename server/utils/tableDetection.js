// A printed table caption is an additional signal when the text model missed
// has_table. It only unlocks a reviewable attempt, not an invented table.
export function isTableSuspected(photo) {
  return Boolean(photo?.has_table || photo?.table_status === "ready"
    || /(?:^|\n)\s*таблица\s*\d{1,3}\s*[—–-]\s*\S/imu.test(String(photo?.ocr_text || "")));
}
