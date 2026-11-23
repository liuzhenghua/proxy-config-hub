import { configs } from './config-catalog.js';

const byId = id => document.getElementById(id);
const toast = byId('toast');
let toastTimer;

async function copyLink(url, input) {
  try {
    await navigator.clipboard.writeText(url);
    toast.textContent = '已复制链接';
  } catch {
    input.focus();
    input.select();
    toast.textContent = '链接已选中，请手动复制';
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 3200);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

for (const { client, directory, files } of configs) {
  const group = element('section', 'config-group');
  group.append(element('h3', 'client-name', client));
  const list = element('ul', 'entries');
  for (const [file, title, description] of files) {
    const path = '/config/' + directory + '/' + file;
    const row = element('li', 'entry');
    const copy = element('button', 'copy-button', directory === 'openclash' ? '复制覆写 URL' : '复制配置 URL');
    copy.type = 'button';
    copy.setAttribute('aria-label', copy.textContent + ' · ' + title);
    const input = element('input', 'config-url');
    input.readOnly = true;
    input.setAttribute('aria-label', title + ' URL');
    input.value = new URL(path, location.origin).href;
    copy.addEventListener('click', () => copyLink(input.value, input));
    const detail = element('div', 'entry-detail');
    const link = element('a', 'file-link', title);
    link.href = path;
    detail.append(link, element('p', 'description', description), input);
    row.append(detail, copy);
    list.append(row);
  }
  group.append(list);
  byId('config-list').append(group);
}

const form = byId('generate-form');
const password = byId('password');
const toggle = byId('toggle-password');
const output = byId('output');
const feedback = byId('generate-status');
const result = byId('result');

toggle.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? '隐藏密码' : '显示密码';
});

byId('copy-output').addEventListener('click', () => copyLink(output.value, output));
output.addEventListener('focus', () => output.select());

form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  result.hidden = true;
  output.value = '';
  feedback.textContent = '正在生成链接…';
  try {
    const response = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: byId('upstream').value.trim(), password: password.value }),
    });
    const data = await response.json();
    if (!response.ok) {
      feedback.textContent = data.error || '链接生成失败，请稍后重试';
      return;
    }
    output.value = new URL(data.path, location.origin).href;
    form.reset();
    password.type = 'password';
    toggle.textContent = '显示密码';
    result.hidden = false;
    feedback.textContent = '';
    output.focus();
  } catch {
    feedback.textContent = '无法连接订阅服务，请稍后重试';
  } finally {
    submit.disabled = false;
  }
});
