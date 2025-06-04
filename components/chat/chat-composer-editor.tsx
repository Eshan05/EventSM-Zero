"use client";

import { Plugins as EditorMdPlugins } from "@/components/blocks/editor-md/plugins";
import { nodes as editorNodes } from "@/components/blocks/editor-md/nodes";
import { editorTheme } from "@/components/editor/themes/editor-theme";
import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  type LexicalEditor,
  type EditorState,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import { HR } from "@/components/editor/transformers/markdown-hr-transformer";
import { IMAGE } from "@/components/editor/transformers/markdown-image-transformer";
import { TABLE } from "@/components/editor/transformers/markdown-table-transformer";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

export type ChatComposerHandle = {
  focus: () => void;
  clear: () => void;
  insertText: (text: string) => void;
  getMarkdown: () => string;
};

type Props = {
  placeholder?: string;
  disabled?: boolean;
  onMarkdownChange?: (markdown: string) => void;
  onSubmit?: () => void;
  className?: string;
};

const defaultTransformers = [
  TABLE,
  HR,
  IMAGE,
  CHECK_LIST,
  ...ELEMENT_TRANSFORMERS,
  ...MULTILINE_ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
];

function EnterToSendPlugin({
  enabled,
  onSubmit,
}: {
  enabled: boolean;
  onSubmit?: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!enabled) return;

    return editor.registerCommand<KeyboardEvent>(
      KEY_ENTER_COMMAND,
      (event) => {
        if (!event) return false;
        if (event.isComposing) return false;
        if (event.shiftKey) return false;

        event.preventDefault();
        onSubmit?.();
        return true;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, enabled, onSubmit]);

  return null;
}

function EditablePlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return null;
}

function EditorBridgePlugin({
  editorRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor, editorRef]);

  return null;
}

export const ChatComposerEditor = forwardRef<ChatComposerHandle, Props>(
  function ChatComposerEditor(
    {
      placeholder = "Type your message here…",
      disabled = false,
      onMarkdownChange,
      onSubmit,
      className,
    },
    ref
  ) {
    const editorRef = useRef<LexicalEditor | null>(null);
    const markdownRef = useRef<string>("");
    const [, forceRerender] = useState(0);

    const initialConfig = useMemo<InitialConfigType>(
      () => ({
        namespace: "ChatComposer",
        theme: editorTheme,
        nodes: editorNodes,
        onError: (error: Error) => {
          console.error(error);
        },
      }),
      []
    );

    const setMarkdown = useCallback(
      (markdown: string) => {
        markdownRef.current = markdown;
        onMarkdownChange?.(markdown);
      },
      [onMarkdownChange]
    );

    const exportMarkdownFromEditorState = useCallback(
      (editorState: EditorState) => {
        const markdown = editorState.read(() =>
          $convertToMarkdownString(defaultTransformers, undefined, true)
        );
        setMarkdown(markdown);
      },
      [setMarkdown]
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editorRef.current?.focus();
        },
        clear: () => {
          const editor = editorRef.current;
          if (!editor) return;
          editor.update(() => {
            const root = $getRoot();
            root.clear();
          });
          setMarkdown("");
          forceRerender((x) => x + 1);
        },
        insertText: (text: string) => {
          const editor = editorRef.current;
          if (!editor) return;
          editor.focus();
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertText(text);
            }
          });
        },
        getMarkdown: () => markdownRef.current,
      }),
      [setMarkdown]
    );

    const handleSubmit = useCallback(() => {
      if (disabled) return;
      if (!markdownRef.current.trim()) return;
      onSubmit?.();
    }, [disabled, onSubmit]);

    return (
      <div className={className}>
        <LexicalComposer initialConfig={initialConfig}>
          <EditorBridgePlugin editorRef={editorRef} />
          <EditablePlugin disabled={disabled} />
          <EnterToSendPlugin enabled={!disabled} onSubmit={handleSubmit} />

          <EditorMdPlugins
            placeholder={placeholder}
            contentEditableClassName="ContentEditable__root relative block min-h-[44px] max-h-40 overflow-auto px-3 py-2 focus:outline-none"
            placeholderClassName="text-muted-foreground pointer-events-none absolute top-0 left-0 overflow-hidden px-3 py-2 text-ellipsis select-none"
            allowUnderline={false}
            allowImages={true}
          />

          <OnChangePlugin
            ignoreSelectionChange={true}
            onChange={(editorState) => {
              exportMarkdownFromEditorState(editorState);
            }}
          />
        </LexicalComposer>
      </div>
    );
  }
);
