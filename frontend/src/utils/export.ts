export function exportToCSV(data: any[], filename: string) {
  if (!data || !data.length) {
    alert('No data to export');
    return;
  }
  const keys = Object.keys(data[0]);
  const header = keys.join(',');
  const csv = data.map(row => {
    return keys.map(k => {
      let val = row[k];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',');
  });
  const csvStr = [header, ...csv].join('\n');
  const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
