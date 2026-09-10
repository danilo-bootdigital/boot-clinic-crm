'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Smile } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';

// Carregados só quando o popover abre pela 1ª vez — o dataset de emoji sozinho
// pesa ~200KB e um `import` estático dele ia direto pro bundle síncrono da
// mensageria (já a página mais carregada do app), mesmo o Picker em si sendo
// `dynamic`. Os dois — componente E dataset — entram sob demanda.
const Picker = dynamic(() => import('@emoji-mart/react'), { ssr: false });

/** Botão de emoji do composer — todo o Unicode padrão (emoji-mart), não um subconjunto curado. */
export function EmojiButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    if (open && !data) import('@emoji-mart/data').then((m) => setData(m.default));
  }, [open, data]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Emoji"
          aria-label="Inserir emoji"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Smile className="h-4 w-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} className="z-50">
          {data ? (
            <Picker
              data={data}
              onEmojiSelect={(e: { native: string }) => onSelect(e.native)}
              theme="light"
              locale="pt"
              previewPosition="none"
              skinTonePosition="search"
              maxFrequentRows={2}
            />
          ) : (
            <div className="grid h-[300px] w-[280px] place-items-center rounded-lg border border-border bg-popover text-sm text-muted-foreground shadow-popover">
              Carregando…
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default EmojiButton;
