import { useState } from 'react';
import { copyText } from './time';

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, key = 'default') => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    }
  };

  return { copied, copy };
}
