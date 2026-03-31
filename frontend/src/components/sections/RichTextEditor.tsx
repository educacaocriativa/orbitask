'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Mention from '@tiptap/extension-mention'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { MentionSuggestion } from './MentionSuggestion'
import api from '@/lib/api'

interface RichTextEditorProps {
  content: Record<string, unknown> | null
  onSave: (content: Record<string, unknown>) => Promise<void>
  isSaving?: boolean
  placeholder?: string
  readOnly?: boolean
}

export function RichTextEditor({
  content, onSave, isSaving, placeholder = 'Escreva algo...', readOnly = false,
}: RichTextEditorProps) {
  const [isDirty, setIsDirty] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      Link.configure({ openOnClick: false }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: MentionSuggestion,
      }),
    ],
    content: content ?? undefined,
    editable: !readOnly,
    onUpdate: () => setIsDirty(true),
    onFocus: () => setIsExpanded(true),
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },
  })

  const handleSave = useCallback(async () => {
    if (!editor || !isDirty) return
    const json = editor.getJSON() as Record<string, unknown>
    await onSave(json)
    setIsDirty(false)
  }, [editor, isDirty, onSave])

  if (!editor) return null

  return (
    <div className="space-y-2">
      {/* Toolbar — visible when expanded */}
      <AnimatePresence>
        {isExpanded && !readOnly && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-0.5 flex-wrap overflow-hidden"
          >
            {[
              { label: 'B', title: 'Negrito', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), style: 'font-bold' },
              { label: 'I', title: 'Itálico', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), style: 'italic' },
              { label: 'U', title: 'Sublinhado', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), style: 'underline' },
              { label: 'S', title: 'Riscado', action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike'), style: 'line-through' },
            ].map((btn) => (
              <ToolbarButton key={btn.label} onClick={btn.action} active={btn.active} title={btn.title}>
                <span className={btn.style}>{btn.label}</span>
              </ToolbarButton>
            ))}

            <div className="w-px h-4 bg-white/10 mx-1" />

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive('heading', { level: 2 })} title="Título"
            >H2</ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive('bulletList')} title="Lista"
            >•—</ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive('orderedList')} title="Lista numerada"
            >1.</ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive('blockquote')} title="Citação"
            >"</ToolbarButton>

            <ToolbarButton
              onClick={() => editor.chain().focus().toggleCode().run()}
              active={editor.isActive('code')} title="Código"
            >{`</>`}</ToolbarButton>

            <div className="w-px h-4 bg-white/10 mx-1" />

            <span className="text-[10px] text-white/25 font-body px-1">@ para mencionar</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor area */}
      <div
        onClick={() => setIsExpanded(true)}
        className={cn(
          'rounded-lg transition-all duration-200',
          isExpanded && !readOnly ? 'min-h-[100px]' : 'min-h-[40px]',
        )}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Save row */}
      {isExpanded && !readOnly && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <span className="text-[10px] text-white/20 font-body">
            {isDirty ? '● Alterações não salvas' : '✓ Salvo'}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => { editor.commands.clearContent(); setIsDirty(false); setIsExpanded(false) }}
              className="text-xs px-2.5 py-1 rounded-lg font-body text-white/30 hover:text-white/60 transition-colors"
            >
              Limpar
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className={cn(
                'text-xs px-3 py-1 rounded-lg font-display tracking-wider transition-all',
                isDirty
                  ? 'text-white bg-neon-violet/40 border border-neon-violet/40 hover:bg-neon-violet/60'
                  : 'text-white/25 bg-white/5 border border-white/8 cursor-default',
              )}
            >
              {isSaving ? '⚡ Salvando...' : '💾 Salvar'}
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function ToolbarButton({
  children, onClick, active, title,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'px-2 py-1 rounded-md text-xs font-mono transition-all duration-150',
        active
          ? 'bg-neon-violet/30 text-neon-purple border border-neon-violet/40'
          : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent',
      )}
    >
      {children}
    </button>
  )
}

