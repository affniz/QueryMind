interface DataTableProps {
  data: any[];
}

export default function DataTable({ data }: DataTableProps) {
  if (!data || data.length === 0) return null;
  
  const groupData = (rawData: any[]) => {
    if (rawData.length <= 1) return rawData;
    const firstCol = Object.keys(rawData[0])[0];
    const hasDuplicates = new Set(rawData.map(r => r[firstCol])).size !== rawData.length;
    
    if (!hasDuplicates) return rawData;

    const grouped: any[] = [];
    rawData.forEach(row => {
      const existing = grouped.find(g => g[firstCol] === row[firstCol]);
      if (existing) {
        Object.keys(row).forEach(col => {
          if (col === firstCol) return;
          if (existing[col] === undefined) {
             existing[col] = row[col];
          } else if (Array.isArray(existing[col])) {
             if (!existing[col].some((val: any) => JSON.stringify(val) === JSON.stringify(row[col]))) {
               existing[col].push(row[col]);
             }
          } else if (JSON.stringify(existing[col]) !== JSON.stringify(row[col])) {
             existing[col] = [existing[col], row[col]];
          }
        });
      } else {
        grouped.push({ ...row });
      }
    });
    return grouped;
  };

  const displayData = groupData(data);
  const columns = Object.keys(displayData[0]);

  return (
    <div className="h-full overflow-auto scrollbar-custom bg-[#11141d]">
      <table className="w-full text-left border-collapse text-[13px] whitespace-nowrap">
        <thead>
          <tr>
            <th className="text-left text-slate-400 font-medium py-3 px-4 border-b border-white/5 sticky top-0 bg-[#252b3d]">Rank</th>
            {columns.map(col => (
              <th key={col} className="text-left text-slate-400 font-medium py-3 px-4 border-b border-white/5 sticky top-0 bg-[#252b3d] whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayData.map((row, i) => (
            <tr key={i} className="even:bg-white/[0.02]">
              <td className="py-3 px-4 border-b border-white/5 text-slate-300 whitespace-nowrap">{i + 1}</td>
              {columns.map(col => (
                <td key={col} className="py-3 px-4 border-b border-white/5 text-slate-300 whitespace-nowrap">
                  {Array.isArray(row[col]) 
                    ? row[col].map((val: any) => (typeof val === 'object' && val !== null) ? JSON.stringify(val) : String(val ?? '')).join(', ') 
                    : (typeof row[col] === 'object' && row[col] !== null) 
                      ? JSON.stringify(row[col]) 
                      : String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
