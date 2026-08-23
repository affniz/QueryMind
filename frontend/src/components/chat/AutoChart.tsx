import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface AutoChartProps {
  data: any[];
}

export default function AutoChart({ data }: AutoChartProps) {
  if (!data || data.length === 0) return null;
  
  const keys = Object.keys(data[0]);
  const stringKeys: string[] = [];
  const numKeys: string[] = [];
  
  keys.forEach(k => {
    const val = data.find(row => row[k] !== null && row[k] !== undefined)?.[k];
    if (typeof val === 'number') {
      numKeys.push(k);
    } else {
      stringKeys.push(k);
    }
  });

  if (numKeys.length === 0) return null;

  const xAxisKey = stringKeys.length > 0 ? stringKeys[0] : numKeys[0];
  const yAxisKeys = numKeys.filter(k => k !== xAxisKey);
  
  if (yAxisKeys.length === 0) return null;

  const isTimeBased = xAxisKey.toLowerCase().match(/date|time|year|month|day|created/);
  
  const ChartComponent = isTimeBased ? LineChart : BarChart;
  const DataComponent = isTimeBased ? Line : Bar;
  const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="w-full h-full min-h-[200px]">
      <ResponsiveContainer>
        <ChartComponent data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey={xAxisKey} 
            stroke="#64748b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
            tickFormatter={(val: string) => val.length > 15 ? val.substring(0, 15) + '...' : val}
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false} 
            tickFormatter={(value: number) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString()} 
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#11141d', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
            itemStyle={{ color: '#fff', fontSize: '13px' }}
            labelStyle={{ color: '#9ca3af', marginBottom: '8px', fontSize: '12px' }}
            cursor={{ fill: 'rgba(255,255,255,0.02)' }}
          />
          <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '13px', color: '#cbd5e1' }} iconType="circle" />
          {yAxisKeys.map((k, i) => (
            <DataComponent 
              key={k} 
              type="monotone" 
              dataKey={k} 
              fill={colors[i % colors.length]} 
              stroke={colors[i % colors.length]} 
              strokeWidth={3}
              radius={(!isTimeBased ? [4, 4, 0, 0] : undefined) as any}
            />
          ))}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
