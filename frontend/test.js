import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('/datasets/relationships/')) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, source_dataset_id: 1, target_dataset_id: 2, source_column: 'id', target_column: 'user_id' }])
      });
    } else if (request.url().includes('/datasets?')) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: '1', name: 'users.csv', columns: { id: 'integer', name: 'string' }, user_id: 1 },
          { id: '2', name: 'orders.csv', columns: { id: 'integer', user_id: 'integer' }, user_id: 1 }
        ])
      });
    } else if (request.url().includes('/datasets/1/preview')) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [{ id: 1, name: 'Alice' }] })
      });
    } else if (request.url().includes('/datasets/1')) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '1', name: 'users.csv', columns: { id: 'integer', name: 'string' }, user_id: 1 })
      });
    } else {
      request.continue();
    }
  });

  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGV4YW1wbGUuY29tIn0.signature');
    localStorage.setItem('qm_folders', '["Sales Data"]');
    localStorage.setItem('qm_ds_folders', '{"1":"Sales Data", "2":"Sales Data"}');
  });

  console.log('Navigating to http://localhost:5173/');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' }).catch(e => console.log(e));
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('Dumping DOM before click:');
  const dom1 = await page.evaluate(() => document.getElementById('root')?.innerHTML.substring(0, 500));
  console.log(dom1);

  console.log('Navigating to http://localhost:5173/dataset/1');
  await page.goto('http://localhost:5173/dataset/1', { waitUntil: 'networkidle2' }).catch(e => console.log(e));
  
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Dumping DOM after navigation:');
  const dom2 = await page.evaluate(() => document.getElementById('root')?.innerHTML);
  console.log('DOM LENGTH:', dom2?.length);
  if (dom2 && dom2.length < 500) {
    console.log('DOM CONTENT:', dom2);
  } else {
    // just print if it has the chat assistant
    const hasChatAssistant = dom2?.includes('Chat Assistant');
    const hasDataAssistant = dom2?.includes('Data Assistant');
    const hasLoading = dom2?.includes('Loading...');
    const textContent = await page.evaluate(() => document.body.innerText);
    console.log('HAS CHAT ASSISTANT:', hasChatAssistant);
    console.log('HAS DATA ASSISTANT:', hasDataAssistant);
    console.log('HAS LOADING:', hasLoading);
    console.log('PAGE TEXT:\n', textContent.substring(0, 1000));
  }

  await browser.close();
  console.log('Done');
})();
