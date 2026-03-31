import { ReactRenderer } from '@tiptap/react'
import tippy from 'tippy.js'
import type { SuggestionOptions } from '@tiptap/extension-mention'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { cn, getInitials } from '@/lib/utils'
import api from '@/lib/api'

// ── Suggestion list component ──────────────────────────────
interface SuggestionUser { id: string; name: string; email: string; avatarUrl?: string }

interface MentionListProps {
  items: SuggestionUser[]
  command: (item: { id: string; label: string }) => void
}

const MentionList = forwardRef<{ onKeyDown: (e: KeyboardEvent) => boolean }, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useImperativeHandle(ref, () => ({
      onKeyDown({ key }: KeyboardEvent) {
        if (key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
          return true
        }
        if (key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (key === 'Enter') {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    function selectItem(index: number) {
      const item = items[index]
      if (item) command({ id: item.id, label: item.name })
    }

    if (!items.length) return null

    return (
      <div className="mention-suggestions min-w-[200px] max-h-[240px] overflow-y-auto">
        {items.map((user, index) => (
          <button
            key={user.id}
            onClick={() => selectItem(index)}
            className={cn(
              'mention-suggestion-item w-full text-left',
              index === selectedIndex && 'is-selected',
            )}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-display font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed60, #06b6d460)' }}
            >
              {getInitials(user.name)}
            </div>
            {/* Info */}
            <div className="min-w-0">
              <div className="text-white/80 font-body text-xs truncate">{user.name}</div>
              <div className="text-white/30 font-body text-[10px] truncate">{user.email}</div>
            </div>
            {/* Rocket icon for selection feedback */}
            {index === selectedIndex && (
              <span className="ml-auto text-xs">🚀</span>
            )}
          </button>
        ))}
      </div>
    )
  }
)

MentionList.displayName = 'MentionList'

// ── Suggestion config ──────────────────────────────────────
export const MentionSuggestion: Omit<SuggestionOptions, 'editor'> = {
  // Fetch users matching the query
  items: async ({ query }) => {
    try {
      const { data } = await api.get('/users', {
        params: { search: query },
      })
      return (data.users as SuggestionUser[]).filter((u) =>
        u.name.toLowerCase().includes(query.toLowerCase())
      )
    } catch {
      return []
    }
  },

  render: () => {
    let component: ReactRenderer<any>
    let popup: ReturnType<typeof tippy>

    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) return

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
          theme: 'space',
          animation: 'shift-away',
          arrow: false,
        })
      },

      onUpdate(props) {
        component.updateProps(props)
        if (!props.clientRect) return
        popup[0].setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        })
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup[0].hide()
          return true
        }
        return component.ref?.onKeyDown(props.event) ?? false
      },

      onExit() {
        popup[0].destroy()
        component.destroy()
      },
    }
  },
}

