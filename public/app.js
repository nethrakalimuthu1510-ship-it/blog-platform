/* Marginalia: single-page frontend (vanilla JS, hash routing) */
const app = document.getElementById('app');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');
const TOKEN_KEY = 'marginalia_token';
let currentUser = null;

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) { localStorage.removeItem(TOKEN_KEY); currentUser = null; renderNav(); }
    throw new Error((data && data.error) || 'Request failed.');
  }
  return data;
}

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const edited = (o) => (o.updated_at !== o.created_at ? ' (edited)' : '');
const go = (hash) => { location.hash = hash; };

function paragraphs(text) {
  return text.split(/\n{2,}/).map((p) => h('p', {}, p.trim())).filter((p) => p.textContent);
}

/* ---------- nav / auth state ---------- */
function renderNav() {
  nav.replaceChildren();
  if (currentUser) {
    nav.append(
      h('span', { class: 'who' }, currentUser.username),
      h('a', { class: 'btn ghost', href: '#/new' }, 'Write a post'),
      h('button', { class: 'btn plain', onclick: logout }, 'Log out')
    );
  } else {
    nav.append(
      h('a', { class: 'btn plain', href: '#/login' }, 'Log in'),
      h('a', { class: 'btn', href: '#/register' }, 'Create account')
    );
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  renderNav();
  toast('Logged out');
  go('#/');
  route();
}

async function loadUser() {
  if (!localStorage.getItem(TOKEN_KEY)) return;
  try { currentUser = (await api('/auth/me')).user; } catch { currentUser = null; }
}

/* ---------- views ---------- */
async function homeView(query) {
  const q = query.get('q') || '';
  const page = parseInt(query.get('page'), 10) || 1;
  const data = await api(`/posts?q=${encodeURIComponent(q)}&page=${page}`);

  const search = h('input', { type: 'search', name: 'q', value: q, placeholder: 'Search posts', 'aria-label': 'Search posts' });
  const form = h('form', { class: 'toolbar', onsubmit: (e) => { e.preventDefault(); go('#/?q=' + encodeURIComponent(search.value.trim())); } },
    search, h('button', { class: 'btn', type: 'submit' }, 'Search'));

  const list = data.posts.length
    ? data.posts.map((p) =>
        h('article', { class: 'entry' },
          h('h2', {}, h('a', { href: '#/post/' + p.id }, p.title)),
          h('div', { class: 'meta' }, `${p.author} on ${fmtDate(p.created_at)} · ${p.comment_count} comment${p.comment_count === 1 ? '' : 's'}`),
          h('p', {}, p.excerpt)))
    : [h('div', { class: 'empty' }, q ? `No posts match "${q}".` : 'No posts yet. Log in and write the first one.')];

  const link = (p) => '#/?q=' + encodeURIComponent(q) + '&page=' + p;
  const pager = data.pages > 1 && h('div', { class: 'pager' },
    page > 1 ? h('a', { href: link(page - 1) }, 'Newer posts') : h('span'),
    h('span', { class: 'meta' }, `Page ${data.page} of ${data.pages}`),
    page < data.pages ? h('a', { href: link(page + 1) }, 'Older posts') : h('span'));

  app.replaceChildren(...[h('h1', {}, 'Latest posts'), form, ...list, pager].filter(Boolean));
}

async function postView(id) {
  const [{ post }, { comments }] = await Promise.all([api('/posts/' + id), api(`/posts/${id}/comments`)]);
  const isOwner = currentUser && currentUser.id === post.user_id;

  const head = h('header', { class: 'post-head' },
    h('h1', {}, post.title),
    h('div', { class: 'meta' }, `${post.author} on ${fmtDate(post.created_at)}${edited(post)}`),
    isOwner && h('div', { class: 'owner-actions' },
      h('a', { class: 'btn ghost', href: '#/edit/' + post.id }, 'Edit'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!confirm('Delete this post and all its comments?')) return;
        try { await api('/posts/' + post.id, { method: 'DELETE' }); toast('Post deleted'); go('#/'); }
        catch (e) { toast(e.message); }
      } }, 'Delete')));

  const listEl = h('div', { id: 'comment-list' });
  const countEl = h('h2', {});
  const renderComments = (items) => {
    countEl.textContent = `${items.length} comment${items.length === 1 ? '' : 's'}`;
    listEl.replaceChildren(...items.map((c) => commentEl(c, post, items, renderComments)));
  };

  let commentForm;
  if (currentUser) {
    const ta = h('textarea', { name: 'body', maxlength: '2000', placeholder: 'Add a comment', 'aria-label': 'Add a comment', required: 'required' });
    const err = h('div', { class: 'form-error' });
    const btn = h('button', { class: 'btn', type: 'submit' }, 'Post comment');
    commentForm = h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try {
        const { comment } = await api(`/posts/${post.id}/comments`, { method: 'POST', body: { body: ta.value } });
        comments.push(comment); ta.value = ''; renderComments(comments);
      } catch (ex) { err.textContent = ex.message; }
      btn.disabled = false;
    } }, ta, err, h('div', { class: 'actions' }, btn));
  } else {
    commentForm = h('p', { class: 'login-prompt' }, h('a', { href: '#/login' }, 'Log in'), ' or ', h('a', { href: '#/register' }, 'create an account'), ' to join the discussion.');
  }

  app.replaceChildren(head, h('div', { class: 'post-body' }, paragraphs(post.body)),
    h('section', { class: 'comments' }, countEl, listEl, commentForm));
  renderComments(comments);
}

function commentEl(c, post, all, rerender) {
  const mine = currentUser && currentUser.id === c.user_id;
  const canDelete = mine || (currentUser && currentUser.id === post.user_id);
  const box = h('div', { class: 'comment' });

  const showView = () => {
    box.replaceChildren(
      h('div', { class: 'row' },
        h('span', { class: 'meta' }, `${c.author} on ${fmtDate(c.created_at)}${edited(c)}`),
        mine && h('button', { class: 'btn plain', onclick: showEdit }, 'Edit'),
        canDelete && h('button', { class: 'btn plain danger', onclick: async () => {
          if (!confirm('Delete this comment?')) return;
          try {
            await api('/comments/' + c.id, { method: 'DELETE' });
            all.splice(all.indexOf(c), 1); rerender(all); toast('Comment deleted');
          } catch (e) { toast(e.message); }
        } }, 'Delete')),
      h('p', {}, c.body));
  };

  const showEdit = () => {
    const ta = h('textarea', { maxlength: '2000', 'aria-label': 'Edit comment' }, c.body);
    ta.value = c.body;
    const err = h('div', { class: 'form-error' });
    box.replaceChildren(ta, err, h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => {
        try {
          const { comment } = await api('/comments/' + c.id, { method: 'PUT', body: { body: ta.value } });
          Object.assign(c, comment); showView(); toast('Comment updated');
        } catch (e) { err.textContent = e.message; }
      } }, 'Save'),
      h('button', { class: 'btn ghost', onclick: showView }, 'Cancel')));
    ta.focus();
  };

  showView();
  return box;
}

async function editorView(id) {
  if (!currentUser) { go('#/login'); return; }
  let post = { title: '', body: '' };
  if (id) {
    post = (await api('/posts/' + id)).post;
    if (post.user_id !== currentUser.id) { toast('You can only edit your own posts.'); go('#/post/' + id); return; }
  }
  const title = h('input', { name: 'title', maxlength: '150', required: 'required', value: post.title });
  const body = h('textarea', { name: 'body', maxlength: '20000', required: 'required', style: 'min-height:18rem' });
  body.value = post.body;
  const err = h('div', { class: 'form-error' });
  const btn = h('button', { class: 'btn', type: 'submit' }, id ? 'Save changes' : 'Publish');

  app.replaceChildren(
    h('h1', {}, id ? 'Edit post' : 'Write a post'),
    h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try {
        const res = await api(id ? '/posts/' + id : '/posts', { method: id ? 'PUT' : 'POST', body: { title: title.value, body: body.value } });
        toast(id ? 'Changes saved' : 'Published');
        go('#/post/' + res.post.id);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    } },
      h('label', { for: 'title' }, 'Title'), (title.id = 'title', title),
      h('label', { for: 'body' }, 'Body (leave a blank line between paragraphs)'), (body.id = 'body', body),
      err,
      h('div', { class: 'actions' }, btn, h('a', { class: 'btn ghost', href: id ? '#/post/' + id : '#/' }, 'Cancel'))));
  title.focus();
}

function authView(mode) {
  if (currentUser) { go('#/'); return; }
  const isReg = mode === 'register';
  const f = {
    username: h('input', { id: 'username', autocomplete: 'username', required: 'required' }),
    email: h('input', { id: 'email', type: 'email', autocomplete: 'email', required: 'required' }),
    identifier: h('input', { id: 'identifier', autocomplete: 'username', required: 'required' }),
    password: h('input', { id: 'password', type: 'password', autocomplete: isReg ? 'new-password' : 'current-password', required: 'required', minlength: isReg ? '8' : null }),
  };
  const err = h('div', { class: 'form-error' });
  const btn = h('button', { class: 'btn', type: 'submit' }, isReg ? 'Create account' : 'Log in');

  const form = h('form', { class: 'narrow', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; btn.disabled = true;
    try {
      const body = isReg
        ? { username: f.username.value, email: f.email.value, password: f.password.value }
        : { identifier: f.identifier.value, password: f.password.value };
      const data = await api('/auth/' + mode, { method: 'POST', body });
      localStorage.setItem(TOKEN_KEY, data.token);
      currentUser = data.user; renderNav();
      toast(isReg ? 'Welcome, ' + data.user.username : 'Logged in');
      go('#/');
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  } },
    ...(isReg
      ? [h('label', { for: 'username' }, 'Username'), f.username, h('label', { for: 'email' }, 'Email'), f.email]
      : [h('label', { for: 'identifier' }, 'Username or email'), f.identifier]),
    h('label', { for: 'password' }, isReg ? 'Password (at least 8 characters)' : 'Password'), f.password,
    err, h('div', { class: 'actions' }, btn));

  app.replaceChildren(
    h('h1', {}, isReg ? 'Create your account' : 'Log in'), form,
    h('p', { class: 'meta' }, isReg ? 'Already registered? ' : 'New here? ',
      h('a', { href: isReg ? '#/login' : '#/register' }, isReg ? 'Log in' : 'Create an account')));
  (isReg ? f.username : f.identifier).focus();
}

/* ---------- router ---------- */
async function route() {
  const [path, qs] = (location.hash || '#/').split('?');
  const query = new URLSearchParams(qs || '');
  let m;
  try {
    if (path === '#/' || path === '#') await homeView(query);
    else if ((m = path.match(/^#\/post\/(\d+)$/))) await postView(m[1]);
    else if (path === '#/new') await editorView(null);
    else if ((m = path.match(/^#\/edit\/(\d+)$/))) await editorView(m[1]);
    else if (path === '#/login') authView('login');
    else if (path === '#/register') authView('register');
    else app.replaceChildren(h('h1', {}, 'Page not found'), h('a', { href: '#/' }, 'Back to all posts'));
  } catch (e) {
    app.replaceChildren(h('h1', {}, 'Something went wrong'), h('p', {}, e.message), h('a', { href: '#/' }, 'Back to all posts'));
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
(async () => { await loadUser(); renderNav(); route(); })();
