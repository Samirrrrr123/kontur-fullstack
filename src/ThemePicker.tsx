import { useEffect, useRef, useState } from 'react'
import { Sun, Moon, Monitor, Check } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'
const choices = [
  { value: 'light' as Theme, label: 'Светлая', icon: Sun },
  { value: 'dark' as Theme, label: 'Тёмная', icon: Moon },
  { value: 'system' as Theme, label: 'Как в системе', icon: Monitor }
]
function savedTheme(): Theme {
  try {
    const value = localStorage.getItem('kontur.theme')
    return value === 'dark' || value === 'system' ? value : 'light'
  } catch { return 'light' }
}
export default function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme
      try { localStorage.setItem('kontur.theme', theme) } catch {}
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); container.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const Icon = choices.find(x => x.value === theme)!.icon
  return <div className="theme-picker" ref={container}>
    <button className="icon-button theme-toggle" title="Тема оформления" aria-label="Тема оформления" aria-expanded={open} aria-controls="theme-options" onClick={() => setOpen(!open)}><Icon size={19} /></button>
    {open && <div className="theme-options" id="theme-options" role="group" aria-label="Выбор темы">
      {choices.map(choice => <button key={choice.value} className={theme === choice.value ? 'chosen' : ''} aria-pressed={theme === choice.value} onClick={() => { setTheme(choice.value); setOpen(false) }}><choice.icon size={17} /><span>{choice.label}</span>{theme === choice.value && <Check size={15} />}</button>)}
    </div>}
  </div>
}
