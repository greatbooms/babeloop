import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { messages } from './messages';

export type Lang = 'ko' | 'zhTw';
type StorageReader = Pick<Storage, 'getItem'>;
type Dictionaries = { ko: MessageDictionary; zhTw: MessageDictionary };
type MessageDictionary = Record<string, unknown>;

const LANG_STORAGE_KEY = 'babeloop-lang';
const LEGACY_BRIEF_LANG_STORAGE_KEY = 'babeloop-brief-lang';

function readPath(dictionary: MessageDictionary, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as MessageDictionary)[part];
  }, dictionary);
  return typeof value === 'string' ? value : undefined;
}

export function resolveInitialLang(storage: StorageReader): Lang {
  const saved = storage.getItem(LANG_STORAGE_KEY) ?? storage.getItem(LEGACY_BRIEF_LANG_STORAGE_KEY);
  return saved === 'zhTw' ? 'zhTw' : 'ko';
}

export function getMessage(dictionaries: Dictionaries, lang: Lang, key: string, values?: Record<string, string | number>): string {
  const template = readPath(dictionaries[lang], key) ?? readPath(dictionaries.ko, key) ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]));
}

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => resolveInitialLang(window.localStorage));
  const setLang = useCallback((nextLang: Lang) => {
    window.localStorage.setItem(LANG_STORAGE_KEY, nextLang);
    setLangState(nextLang);
  }, []);
  const t = useCallback((key: string, values?: Record<string, string | number>) => getMessage(messages, lang, key, values), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  const value = useContext(LangContext);
  if (!value) throw new Error('useT must be used inside LangProvider');
  return value;
}
