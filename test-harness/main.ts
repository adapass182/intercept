// test-harness/main.ts
document.getElementById('fetch-btn')!.addEventListener('click', async () => {
  const output = document.getElementById('output')!
  output.textContent = 'Loading...'
  try {
    const res = await fetch('https://jsonplaceholder.typicode.com/users/1')
    const json = await res.json()
    output.textContent = `Status: ${res.status}\n\n${JSON.stringify(json, null, 2)}`
  } catch (e) {
    output.textContent = `Error: ${(e as Error).message}`
  }
})
