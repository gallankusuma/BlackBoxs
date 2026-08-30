import 'dotenv/config';
const API = 'http://localhost:3005/api';
const call = async (m: string, p: string, b?: any, t?: string) => {
  const r = await fetch(`${API}${p}`, { method: m,
    headers: { ...(b ? {'Content-Type':'application/json'} : {}), ...(t ? {Authorization:`Bearer ${t}`} : {}) },
    ...(b ? { body: JSON.stringify(b) } : {}) });
  const x = await r.text(); let j: any = null; try { j = JSON.parse(x); } catch {}
  return { status: r.status, json: j };
};
(async () => {
  const stamp = Date.now().toString().slice(-6);
  const tok = (await call('POST','/auth/login',{ email: process.env.ADMIN_EMAIL||'master@admin.com',
    password: process.env.ADMIN_PASS||process.env.MASTER_PASSWORD||'master' })).json?.token;
  const ah = await call('POST','/estimator/ahsp',{ kode:`BG.${stamp}`, name:`Beton uji ${stamp}`,
    satuan:'m3', status:'active', items:[{section:'B',resource_type:'material',resource_name:'X',
    resource_satuan:'m3',koefisien:1,resource_harga:1000000}] }, tok);
  const p = await call('POST','/estimator/proposals',{ project_name:`Bug qty ${stamp}`, status:'draft' }, tok);
  const pid = p.json?.id;
  const z = await call('POST',`/estimator/proposals/${pid}/mto`,{ element_type:'foundation',
    element_name:`Pondasi ${stamp}`,
    parameters:{ foundation_type:'footplate', L:2, W:2, H:0.4, qty:10, depth:1.5, lean_t:0.05 } }, tok);
  const eid = z.json?.id;
  console.log('zona dibuat:', eid, '| kuantitas dari POST /mto:',
    JSON.stringify(z.json?.lines?.slice(0,2)));

  const u = await call('GET',`/estimator/proposals/${pid}/mto/${eid}/usul-rab`, undefined, tok);
  const bc = (u.json?.lines||[]).find((l:any)=>l.line_code==='FND-CONC');
  console.log('usul-rab FND-CONC → net_quantity:', bc?.net_quantity, '| usulan:', (bc?.usulan||[]).length);

  const ahspId = (bc?.usulan||[])[0]?.ahsp_id ?? ah.json?.id;
  const t = await call('POST',`/estimator/proposals/${pid}/mto/${eid}/rab`,
    { lines:[{ line_code:'FND-CONC', ahsp_id: ahspId }] }, tok);
  console.log('terap status:', t.status, '| dibuat:', JSON.stringify(t.json?.dibuat));

  const { dbAll, dbRun } = await import('../src/config/database');
  const items:any[] = await dbAll('SELECT id, ahsp_code_snapshot, qty, unit_snapshot, total_price FROM proposal_items WHERE proposal_id=?',[pid]);
  console.log('DI DATABASE:', JSON.stringify(items));
  const dari = await call('GET',`/estimator/proposals/${pid}/items`, undefined, tok);
  console.log('DARI GET /items:', JSON.stringify((dari.json?.items||dari.json||[]).map((x:any)=>({id:x.id,qty:x.qty,total:x.total_price}))));
  await dbRun('DELETE FROM proposals WHERE id=?',[pid]);
  await dbRun('DELETE FROM ahsp_headers WHERE kode=?',[`BG.${stamp}`]);
})();
