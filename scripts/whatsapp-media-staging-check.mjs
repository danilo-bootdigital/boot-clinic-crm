// Validação CONTROLADA dos endpoints de mídia da Evolution — SOMENTE staging/teste.
// NÃO usa produção nem número real: exige variáveis STAGING_* explícitas e RECUSA
// rodar contra o host de produção. Não envia nada sem número de teste autorizado.
//
// Uso:
//   STAGING_EVOLUTION_URL=https://evo-staging.exemplo \
//   STAGING_EVOLUTION_KEY=<apikey_staging> \
//   STAGING_INSTANCE=<instancia_teste> \
//   TEST_WHATSAPP_NUMBER=<numero_de_teste_autorizado> \
//   node scripts/whatsapp-media-staging-check.mjs
//
// Cobre os itens 2–11 da validação (contrato de envio/recebimento). Itens 12–15
// (storage privado, signed URL, órfão, isolamento) são cobertos pelos testes
// automatizados (npm test + npm run test:integration). Item 1 (versão) é checado aqui.
// NUNCA imprime a apikey.

const URL = process.env.STAGING_EVOLUTION_URL;
const KEY = process.env.STAGING_EVOLUTION_KEY;
const INST = process.env.STAGING_INSTANCE;
const TO = process.env.TEST_WHATSAPP_NUMBER;

const PROD_HOSTS = ['evolution.bootclinic.com.br']; // NUNCA rodar aqui

function die(msg) { console.error('❌ ' + msg); process.exit(1); }
if (!URL || !KEY || !INST || !TO) {
  die('Defina STAGING_EVOLUTION_URL, STAGING_EVOLUTION_KEY, STAGING_INSTANCE e TEST_WHATSAPP_NUMBER (número de teste autorizado).');
}
let host;
try { host = new global.URL(URL).host; } catch { die('STAGING_EVOLUTION_URL inválida'); }
if (PROD_HOSTS.some((h) => host.includes(h))) {
  die(`Recusado: ${host} é PRODUÇÃO. Use uma instância/servidor de STAGING dedicado.`);
}

const base = URL.replace(/\/$/, '');
const ok = (m) => console.log('  ✅ ' + m);
const info = (m) => console.log('  · ' + m);
const bad = (m) => { console.log('  ⚠️  ' + m); process.exitCode = 1; };

async function evo(path, init = {}, timeoutMs = 30000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(base + path, {
      ...init,
      signal: ctl.signal,
      headers: { apikey: KEY, ...(init.headers || {}) },
    });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, json };
  } catch (e) {
    return { status: 0, ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(t); }
}
const j = (o) => JSON.stringify(o).slice(0, 400); // resposta sanitizada e truncada

// Amostras mínimas VÁLIDas (sem dado real).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
const PDF_BYTES = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
const PDF_B64 = PDF_BYTES.toString('base64');

async function main() {
  console.log(`\n== Evolution media staging check → ${host} (instância ${INST}) ==\n`);

  // (1) Versão
  console.log('1) Versão');
  const v = await evo('/', {});
  v.json?.version ? ok(`version=${v.json.version} whatsappWeb=${v.json.whatsappWebVersion || '?'}`) : bad(`sem versão (status ${v.status})`);

  // Conexão da instância
  console.log('Instância / conexão');
  const st = await evo(`/instance/connectionState/${encodeURIComponent(INST)}`, {});
  const state = st.json?.instance?.state ?? st.json?.state;
  state === 'open' ? ok(`state=open (conectada)`) : bad(`instância NÃO conectada (state=${state}); pareie antes de enviar.`);

  // (2/4/5) Envio de imagem — testa JSON+base64 E multipart p/ descobrir o aceito
  console.log('2/4) Envio de IMAGEM (descobrindo o formato aceito)');
  const jsonImg = await evo(`/message/sendMedia/${encodeURIComponent(INST)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: TO, mediatype: 'image', mimetype: 'image/png', media: PNG_B64, fileName: 'staging-test.png', caption: 'staging check (imagem)' }),
  });
  const jsonKeyId = jsonImg.json?.key?.id;
  if (jsonImg.ok && jsonKeyId) ok(`JSON+base64 ACEITO → key.id=${jsonKeyId}`);
  else info(`JSON+base64 → status ${jsonImg.status} resp ${j(jsonImg.json ?? jsonImg.error)}`);

  let multiKeyId;
  try {
    const fd = new FormData();
    fd.append('number', TO);
    fd.append('mediatype', 'image');
    fd.append('caption', 'staging check (imagem multipart)');
    fd.append('fileName', 'staging-test-mp.png');
    fd.append('media', new Blob([Buffer.from(PNG_B64, 'base64')], { type: 'image/png' }), 'staging-test-mp.png');
    const multiImg = await evo(`/message/sendMedia/${encodeURIComponent(INST)}`, { method: 'POST', body: fd });
    multiKeyId = multiImg.json?.key?.id;
    if (multiImg.ok && multiKeyId) ok(`multipart ACEITO → key.id=${multiKeyId}`);
    else info(`multipart → status ${multiImg.status} resp ${j(multiImg.json ?? multiImg.error)}`);
  } catch (e) { info(`multipart erro: ${e.message}`); }

  const acceptedForm = jsonKeyId ? 'json' : multiKeyId ? 'multipart' : null;
  acceptedForm ? ok(`FORMATO ACEITO PELO SERVIDOR: ${acceptedForm}`) : bad('NENHUM formato de sendMedia foi aceito — revisar implementação!');

  // (3) Documento no formato aceito
  console.log('3) Envio de DOCUMENTO (formato aceito)');
  if (acceptedForm === 'json') {
    const doc = await evo(`/message/sendMedia/${encodeURIComponent(INST)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: TO, mediatype: 'document', mimetype: 'application/pdf', media: PDF_B64, fileName: 'staging-test.pdf', caption: 'staging check (doc)' }),
    });
    doc.ok && doc.json?.key?.id ? ok(`documento enviado → key.id=${doc.json.key.id}`) : bad(`documento falhou: ${doc.status} ${j(doc.json ?? doc.error)}`);
  } else if (acceptedForm === 'multipart') {
    const fd = new FormData();
    fd.append('number', TO); fd.append('mediatype', 'document'); fd.append('fileName', 'staging-test.pdf');
    fd.append('media', new Blob([PDF_BYTES], { type: 'application/pdf' }), 'staging-test.pdf');
    const doc = await evo(`/message/sendMedia/${encodeURIComponent(INST)}`, { method: 'POST', body: fd });
    doc.ok && doc.json?.key?.id ? ok(`documento enviado → key.id=${doc.json.key.id}`) : bad(`documento falhou: ${doc.status} ${j(doc.json ?? doc.error)}`);
  } else info('pulado (nenhum formato aceito)');

  // (10) Erro / arquivo inválido
  console.log('10) Comportamento em erro (base64 inválido)');
  const errRes = await evo(`/message/sendMedia/${encodeURIComponent(INST)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: TO, mediatype: 'image', mimetype: 'image/png', media: '!!nao-base64!!', fileName: 'x.png' }),
  });
  !errRes.ok ? ok(`erro tratado com status ${errRes.status}`) : bad('base64 inválido NÃO retornou erro (inesperado)');

  // (7/8/9) Recebimento + recuperação de mídia
  console.log('7/8/9) Recebimento de mídia (getBase64FromMediaMessage)');
  info('Envie AGORA, do número de teste, 1 imagem e 1 documento PARA a instância de staging.');
  info('Depois rode findMessages e getBase64 (este script tenta buscar a última mídia):');
  const msgs = await evo(`/chat/findMessages/${encodeURIComponent(INST)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ where: {} }),
  });
  const records = msgs.json?.messages?.records || (Array.isArray(msgs.json) ? msgs.json : []);
  const media = records.find((r) => r?.message?.imageMessage || r?.message?.documentMessage);
  if (!media) { info('nenhuma mídia recebida encontrada ainda — reenvie e re-execute.'); }
  else {
    info(`mídia recebida: type=${media.message.imageMessage ? 'image' : 'document'} key.id=${media.key?.id}`);
    const b = await evo(`/chat/getBase64FromMediaMessage/${encodeURIComponent(INST)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: media, convertToMp4: false }),
    });
    b.ok && (b.json?.base64 || b.json?.media)
      ? ok(`getBase64 OK → mimetype=${b.json?.mimetype || '?'} fileName=${b.json?.fileName || '?'} (base64 omitido)`)
      : bad(`getBase64 falhou: ${b.status} ${j(b.json ?? b.error)}`);
  }

  console.log('\n== Fim. Ajuste sendMediaMessage/getMediaBase64 conforme o FORMATO ACEITO acima. ==');
}
main().catch((e) => die(e.message));
