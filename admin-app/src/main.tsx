import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import './styles.css';

type Language = 'en' | 'uk';
type Access = 'checking' | 'signed-out' | 'blocked' | 'admin' | 'config-missing';
type CollectionId = 'games' | 'questionPacks' | 'users';
type RecordData = { id: string; path: string; data: Record<string, unknown> };
type SortState = { key: string; direction: 'asc' | 'desc' } | null;
type ColumnPrefs = { hidden: string[]; order: string[] };
type ColumnPrefsByCollection = Partial<Record<CollectionId, ColumnPrefs>>;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);
const appNamespace = import.meta.env.VITE_FIREBASE_APP_NAMESPACE || 'team-quiz';

const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const provider = new GoogleAuthProvider();

const labels = {
  en: {
    appTitle: 'Cortex Rush Admin',
    signInTitle: 'Admin sign-in',
    signInBody: 'Sign in with a Google account that has artifacts/{appId}/users/{uid}.admin set to true.',
    signIn: 'Sign in with Google',
    signOut: 'Sign out',
    blockedTitle: 'Access blocked',
    blockedBody: 'This Google account is authenticated but is not marked as an admin.',
    firebaseMissingTitle: 'Firebase config missing',
    firebaseMissingBody: 'Create admin-app/.env.local from .env.example and restart the dev server.',
    games: 'Games',
    questionPacks: 'Question Packs',
    users: 'Users',
    refresh: 'Refresh',
    columns: 'Columns',
    saveFailed: 'Failed to save view settings.',
    loading: 'Loading...',
    noRecords: 'No records found.',
    details: 'Details',
    close: 'Close',
    documentId: 'Document ID',
    emptyValue: 'Empty',
    loadFailed: 'Failed to load collection.',
    rows: 'rows',
    path: 'Path',
    showMore: 'Show more',
    showLess: 'Show less',
    language: 'Language',
    signedInAs: 'Signed in as',
  },
  uk: {
    appTitle: 'Адмін Cortex Rush',
    signInTitle: 'Вхід адміністратора',
    signInBody: 'Увійдіть через Google-акаунт, у якого artifacts/{appId}/users/{uid}.admin має значення true.',
    signIn: 'Увійти через Google',
    signOut: 'Вийти',
    blockedTitle: 'Доступ заблоковано',
    blockedBody: 'Цей Google-акаунт автентифіковано, але він не позначений як адміністратор.',
    firebaseMissingTitle: 'Немає конфігурації Firebase',
    firebaseMissingBody: 'Створіть admin-app/.env.local з .env.example і перезапустіть dev-сервер.',
    games: 'Ігри',
    questionPacks: 'Набори питань',
    users: 'Користувачі',
    refresh: 'Оновити',
    columns: 'Колонки',
    saveFailed: 'Не вдалося зберегти налаштування вигляду.',
    loading: 'Завантаження...',
    noRecords: 'Записів немає.',
    details: 'Деталі',
    close: 'Закрити',
    documentId: 'ID документа',
    emptyValue: 'Порожньо',
    loadFailed: 'Не вдалося завантажити колекцію.',
    rows: 'рядків',
    path: 'Шлях',
    showMore: 'Показати більше',
    showLess: 'Показати менше',
    language: 'Мова',
    signedInAs: 'Вхід як',
  },
} as const;

const collections: Array<{ id: CollectionId; labelKey: keyof typeof labels.en; path: [string, ...string[]] }> = [
  { id: 'games', labelKey: 'games', path: ['artifacts', appNamespace, 'public', 'data', 'rooms'] },
  { id: 'questionPacks', labelKey: 'questionPacks', path: ['artifacts', appNamespace, 'public', 'data', 'packs'] },
  { id: 'users', labelKey: 'users', path: ['artifacts', appNamespace, 'users'] },
];

const timestampFields = ['updatedAt', 'modifiedAt', 'createdAt', 'updated_at', 'created_at'];
const documentIdColumn = '__documentId';
const emptyColumnPrefs: ColumnPrefs = { hidden: [], order: [] };

const formatDate = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'seconds' in value) {
    return new Date(Number((value as { seconds: number }).seconds) * 1000);
  }
  return null;
};

const timestampField = (key?: string) => Boolean(key && timestampFields.includes(key));

const toTableDate = (value: unknown, key?: string): Date | null => {
  const date = toDate(value);
  if (date || !timestampField(key)) return date;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed);
  }
  if (typeof value === 'number') {
    return new Date(value > 9999999999 ? value : value * 1000);
  }
  return null;
};

const toMillis = (value: unknown): number => {
  const date = toDate(value);
  if (date) return date.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const sortRecords = (records: RecordData[]) => records.sort((a, b) => {
  const getTimestamp = (record: RecordData) => {
    const key = timestampFields.find((field) => record.data[field] !== undefined);
    return key ? toMillis(record.data[key]) : 0;
  };
  return getTimestamp(b) - getTimestamp(a);
});

const getSortValue = (record: RecordData, key: string) => {
  const value = key === documentIdColumn ? record.id : record.data[key];
  if (value instanceof Timestamp || value instanceof Date) return toMillis(value);
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return formatCellValue(value);
};

const sortByColumn = (records: RecordData[], sort: SortState) => {
  if (!sort) return records;
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    const left = getSortValue(a, sort.key);
    const right = getSortValue(b, sort.key);

    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right), undefined, { numeric: true }) * direction;
  });
};

const isSimpleObject = (value: unknown) => Boolean(
  value
  && typeof value === 'object'
  && !(value instanceof Timestamp)
  && !(value instanceof Date)
  && !Array.isArray(value)
  && Object.values(value as Record<string, unknown>)
    .every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item)),
);

const formatCellValue = (value: unknown, key?: string): string => {
  const date = toTableDate(value, key);
  if (date) return formatDate(date);
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? '✅' : '❌';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isSimpleObject(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([itemKey, item]) => `${itemKey}: ${formatCellValue(item, itemKey)}`)
      .join(', ');
  }
  return String(value);
};

const formatDetailValue = (value: unknown): string => {
  const json = toPrettyJson(value);
  if (json) return json;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return formatCellValue(value);
};

const toPrettyJson = (value: unknown): string | null => {
  if (value && typeof value === 'object' && !(value instanceof Timestamp) && !(value instanceof Date)) {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
};

const isDetailJson = (value: unknown) => toPrettyJson(value) !== null;

const jsonTokenPattern = /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

const jsonTokenClass = (token: string, isKey = false) => {
  if (token.startsWith('"')) return isKey ? 'json-key' : 'json-string';
  if (token === 'true' || token === 'false') return 'json-boolean';
  if (token === 'null') return 'json-null';
  return 'json-number';
};

const isLongDetail = (text: string) => text.split('\n').length > 22;

const isTableValue = (value: unknown) => !Array.isArray(value) && (
  !value
  || typeof value !== 'object'
  || value instanceof Timestamp
  || value instanceof Date
  || isSimpleObject(value)
);

const getColumns = (records: RecordData[]) => {
  const keys = new Set<string>();
  records.forEach((record) => Object.keys(record.data).forEach((key) => keys.add(key)));
  return Array.from(keys).filter((key) => records.some((record) => isTableValue(record.data[key])));
};

const normalizeColumnPrefs = (value: unknown): ColumnPrefs => {
  if (!value || typeof value !== 'object') return emptyColumnPrefs;
  const prefs = value as Partial<ColumnPrefs>;
  return {
    hidden: Array.isArray(prefs.hidden) ? prefs.hidden.filter((item): item is string => typeof item === 'string') : [],
    order: Array.isArray(prefs.order) ? prefs.order.filter((item): item is string => typeof item === 'string') : [],
  };
};

const normalizePrefsByCollection = (value: unknown): ColumnPrefsByCollection => {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(collections.map((item) => [
    item.id,
    normalizeColumnPrefs((value as Record<string, unknown>)[item.id]),
  ])) as ColumnPrefsByCollection;
};

const applyColumnPrefs = (columns: string[], prefs: ColumnPrefs) => {
  const visible = new Set(columns.filter((column) => !prefs.hidden.includes(column)));
  return [
    ...prefs.order.filter((column) => visible.delete(column)),
    ...columns.filter((column) => visible.has(column)),
  ];
};

const columnLabel = (column: string, documentIdLabel: string) => (
  column === documentIdColumn ? documentIdLabel : column
);

function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<Access>(hasFirebaseConfig ? 'checking' : 'config-missing');
  const [activeCollection, setActiveCollection] = useState<CollectionId>('games');
  const [records, setRecords] = useState<RecordData[]>([]);
  const [selected, setSelected] = useState<RecordData | null>(null);
  const [sort, setSort] = useState<SortState>(null);
  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefsByCollection>({});
  const [showColumns, setShowColumns] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = labels[language];
  const activeConfig = collections.find((item) => item.id === activeCollection) ?? collections[0];

  useEffect(() => {
    if (!auth || !db) return;
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setSelected(null);
      setRecords([]);
      setColumnPrefs({});
      if (!nextUser) {
        setAccess('signed-out');
        return;
      }
      setAccess('checking');
      try {
        const adminDoc = await getDoc(doc(db, 'artifacts', appNamespace, 'users', nextUser.uid));
        setColumnPrefs(normalizePrefsByCollection(adminDoc.data()?.adminTableColumns));
        setAccess(adminDoc.data()?.admin === true ? 'admin' : 'blocked');
      } catch {
        setAccess('blocked');
      }
    });
  }, []);

  const loadCollection = useCallback(async () => {
    if (!db || access !== 'admin') return;
    setLoading(true);
    setError('');
    try {
      const snapshot = await getDocs(collection(db, ...activeConfig.path));
      setRecords(sortRecords(snapshot.docs.map((item) => ({
        id: item.id,
        path: item.ref.path,
        data: item.data(),
      }))));
    } catch {
      setError(t.loadFailed);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [access, activeConfig.path, t.loadFailed]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const dataColumns = useMemo(() => getColumns(records), [records]);
  const allColumns = useMemo(() => [documentIdColumn, ...dataColumns], [dataColumns]);
  const activeColumnPrefs = columnPrefs[activeCollection] ?? emptyColumnPrefs;
  const columns = useMemo(() => applyColumnPrefs(allColumns, activeColumnPrefs), [allColumns, activeColumnPrefs]);
  const sortedRecords = useMemo(() => sortByColumn(records, sort), [records, sort]);
  const saveColumnPrefs = (nextPrefs: ColumnPrefs) => {
    if (!db || !user) return;
    setColumnPrefs((current) => ({ ...current, [activeCollection]: nextPrefs }));
    updateDoc(doc(db, 'artifacts', appNamespace, 'users', user.uid), {
      [`adminTableColumns.${activeCollection}`]: nextPrefs,
      updatedAt: serverTimestamp(),
    }).catch(() => setError(t.saveFailed));
  };
  const setColumnVisible = (column: string, visible: boolean) => {
    if (!visible && sort?.key === column) setSort(null);
    saveColumnPrefs({
      hidden: visible
        ? activeColumnPrefs.hidden.filter((item) => item !== column)
        : [...new Set([...activeColumnPrefs.hidden, column])],
      order: activeColumnPrefs.order,
    });
  };
  const moveColumn = (column: string, offset: -1 | 1) => {
    const order = applyColumnPrefs(allColumns, activeColumnPrefs);
    const index = order.indexOf(column);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    saveColumnPrefs({ hidden: activeColumnPrefs.hidden, order });
  };
  const changeSort = (key: string) => {
    setSort((current) => (
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    ));
  };
  const sortMark = (key: string) => (sort?.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '');

  if (access === 'config-missing') {
    return <Gate title={t.firebaseMissingTitle} body={t.firebaseMissingBody} language={language} onLanguage={setLanguage} />;
  }

  if (access === 'signed-out') {
    return (
      <Gate title={t.signInTitle} body={t.signInBody} language={language} onLanguage={setLanguage}>
        <button className="primary" onClick={() => auth && signInWithPopup(auth, provider)}>{t.signIn}</button>
      </Gate>
    );
  }

  if (access === 'blocked') {
    return (
      <Gate title={t.blockedTitle} body={t.blockedBody} language={language} onLanguage={setLanguage}>
        <button className="secondary" onClick={() => auth && signOut(auth)}>{t.signOut}</button>
      </Gate>
    );
  }

  if (access === 'checking') {
    return <Gate title={t.appTitle} body={t.loading} language={language} onLanguage={setLanguage} />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <h1>{t.appTitle}</h1>
          <p>{t.signedInAs} {user?.email}</p>
        </div>
        <nav>
          {collections.map((item) => (
            <button
              className={activeCollection === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => {
                if (activeCollection === item.id) return;
                setActiveCollection(item.id);
                setRecords([]);
                setSelected(null);
                setError('');
                setSort(null);
                setShowColumns(false);
              }}
            >
              {t[item.labelKey]}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitch language={language} onLanguage={setLanguage} label={t.language} />
          <button className="secondary" onClick={() => auth && signOut(auth)}>{t.signOut}</button>
        </div>
      </aside>

      <main>
        <header className="toolbar">
          <div>
            <h2>{t[activeConfig.labelKey]}</h2>
            <code>{t.path}: /{activeConfig.path.join('/')}</code>
            <span>{records.length} {t.rows}</span>
          </div>
          <div className="toolbar-actions">
            <button className="secondary" onClick={loadCollection} disabled={loading}>
              {loading ? t.loading : t.refresh}
            </button>
            <button className="secondary" onClick={() => setShowColumns((current) => !current)}>
              {t.columns}
            </button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        {showColumns && (
          <div className="columns-panel">
            {allColumns.map((column) => {
              const visible = !activeColumnPrefs.hidden.includes(column);
              return (
                <label key={column} className="column-option">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(event) => setColumnVisible(column, event.target.checked)}
                  />
                  <span>{columnLabel(column, t.documentId)}</span>
                  <button type="button" disabled={!visible} onClick={() => moveColumn(column, -1)}>↑</button>
                  <button type="button" disabled={!visible} onClick={() => moveColumn(column, 1)}>↓</button>
                </label>
              );
            })}
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>
                    <button className="sort-button" type="button" onClick={() => changeSort(column)}>
                      {columnLabel(column, t.documentId)}{sortMark(column)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((record) => (
                <tr key={record.id} onClick={() => setSelected(record)}>
                  {columns.map((column) => (
                    <td key={column} className={column === documentIdColumn ? 'doc-id' : undefined}>
                      {(column === documentIdColumn ? record.id : formatCellValue(record.data[column], column))
                        || <span className="muted">{t.emptyValue}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && records.length === 0 && <div className="empty">{t.noRecords}</div>}
        </div>
      </main>

      {selected && (
        <aside className="details">
          <div className="details-head">
            <div>
              <span>{t.details}</span>
              <h3>{selected.id}</h3>
              <code>/{selected.path}</code>
            </div>
            <button className="icon" onClick={() => setSelected(null)} aria-label={t.close}>X</button>
          </div>
          <dl>
            {Object.entries(selected.data).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <FieldValue value={value} labels={t} />
              </React.Fragment>
            ))}
          </dl>
        </aside>
      )}
    </div>
  );
}

function FieldValue({ value, labels: t }: { value: unknown; labels: typeof labels.en | typeof labels.uk }) {
  const [expanded, setExpanded] = useState(false);
  const text = formatDetailValue(value);
  const long = isLongDetail(text);
  const className = long && !expanded ? 'field-value collapsed' : 'field-value';

  return (
    <dd>
      <div className={long ? 'field-box has-toggle' : 'field-box'}>
        {isDetailJson(value) ? (
          <pre className={className}>
            <JsonSyntax text={text} />
          </pre>
        ) : <div className={className}>{text}</div>}
        {long && (
          <button className="link-button" type="button" onClick={() => setExpanded((current) => !current)}>
            {expanded ? t.showLess : t.showMore}
          </button>
        )}
      </div>
    </dd>
  );
}

function JsonSyntax({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  Array.from(text.matchAll(jsonTokenPattern)).forEach((match) => {
    const token = match[0];
    const index = match.index ?? 0;
    const isKey = token.startsWith('"') && /^\s*:/.test(text.slice(index + token.length));
    parts.push(text.slice(lastIndex, index));
    parts.push(<span className={jsonTokenClass(token, isKey)} key={index}>{token}</span>);
    lastIndex = index + token.length;
  });
  parts.push(text.slice(lastIndex));

  return <>{parts}</>;
}

function Gate({
  title,
  body,
  language,
  onLanguage,
  children,
}: {
  title: string;
  body: string;
  language: Language;
  onLanguage: (language: Language) => void;
  children?: React.ReactNode;
}) {
  return (
    <main className="gate">
      <LanguageSwitch language={language} onLanguage={onLanguage} label={labels[language].language} />
      <section>
        <h1>{title}</h1>
        <p>{body}</p>
        {children}
      </section>
    </main>
  );
}

function LanguageSwitch({
  language,
  onLanguage,
  label,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  label: string;
}) {
  return (
    <label className="language">
      <span>{label}</span>
      <select value={language} onChange={(event) => onLanguage(event.target.value as Language)}>
        <option value="en">English</option>
        <option value="uk">Українська</option>
      </select>
    </label>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
