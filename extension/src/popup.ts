const form = document.querySelector<HTMLFormElement>('#pair-form')!
const code = document.querySelector<HTMLInputElement>('#code')!
const statusElement = document.querySelector<HTMLParagraphElement>('#status')!

form.addEventListener('submit', (event) => {
  event.preventDefault()
  statusElement.textContent = '正在连接…'
  void chrome.runtime.sendMessage({ type: 'pair', code: code.value }).then((result) => {
    statusElement.textContent = result.ok ? '已连接' : result.error
  })
})
