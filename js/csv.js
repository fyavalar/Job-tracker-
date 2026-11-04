export function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = cell === null || cell === undefined ? "" : String(cell);
          if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
          return text;
        })
        .join(",")
    )
    .join("\r\n");
}

export function csvBlob(rows) {
  return new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
}
