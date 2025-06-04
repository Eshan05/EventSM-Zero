import { useMemo, useState, type ComponentProps } from "react"
import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from "@lexical/markdown"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"

import { ContentEditable } from "@/components/editor/editor-ui/content-editable"
import { AutoLinkPlugin } from "@/components/editor/plugins/auto-link-plugin"
import { CodeActionMenuPlugin } from "@/components/editor/plugins/code-action-menu-plugin"
import { CodeHighlightPlugin } from "@/components/editor/plugins/code-highlight-plugin"
import { ComponentPickerMenuPlugin } from "@/components/editor/plugins/component-picker-menu-plugin"
import { DraggableBlockPlugin } from "@/components/editor/plugins/draggable-block-plugin"
import { FloatingLinkEditorPlugin } from "@/components/editor/plugins/floating-link-editor-plugin"
import { FloatingTextFormatToolbarPlugin } from "@/components/editor/plugins/floating-text-format-plugin"
import { ImagesPlugin } from "@/components/editor/plugins/images-plugin"
import { LinkPlugin } from "@/components/editor/plugins/link-plugin"
import { ListMaxIndentLevelPlugin } from "@/components/editor/plugins/list-max-indent-level-plugin"
import { AlignmentPickerPlugin } from "@/components/editor/plugins/picker/alignment-picker-plugin"
import { BulletedListPickerPlugin } from "@/components/editor/plugins/picker/bulleted-list-picker-plugin"
import { CheckListPickerPlugin } from "@/components/editor/plugins/picker/check-list-picker-plugin"
import { CodePickerPlugin } from "@/components/editor/plugins/picker/code-picker-plugin"
import { DividerPickerPlugin } from "@/components/editor/plugins/picker/divider-picker-plugin"
import { HeadingPickerPlugin } from "@/components/editor/plugins/picker/heading-picker-plugin"
import { ImagePickerPlugin } from "@/components/editor/plugins/picker/image-picker-plugin"
import { NumberedListPickerPlugin } from "@/components/editor/plugins/picker/numbered-list-picker-plugin"
import { ParagraphPickerPlugin } from "@/components/editor/plugins/picker/paragraph-picker-plugin"
import { QuotePickerPlugin } from "@/components/editor/plugins/picker/quote-picker-plugin"
import { TablePickerPlugin } from "@/components/editor/plugins/picker/table-picker-plugin"
import { BlockFormatDropDown } from "@/components/editor/plugins/toolbar/block-format-toolbar-plugin"
import { FormatBulletedList } from "@/components/editor/plugins/toolbar/block-format/format-bulleted-list"
import { FormatCheckList } from "@/components/editor/plugins/toolbar/block-format/format-check-list"
import { FormatCodeBlock } from "@/components/editor/plugins/toolbar/block-format/format-code-block"
import { FormatHeading } from "@/components/editor/plugins/toolbar/block-format/format-heading"
import { FormatNumberedList } from "@/components/editor/plugins/toolbar/block-format/format-numbered-list"
import { FormatParagraph } from "@/components/editor/plugins/toolbar/block-format/format-paragraph"
import { FormatQuote } from "@/components/editor/plugins/toolbar/block-format/format-quote"
import { CodeLanguageToolbarPlugin } from "@/components/editor/plugins/toolbar/code-language-toolbar-plugin"
import { ElementFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/element-format-toolbar-plugin"
import { FontFormatToolbarPlugin } from "@/components/editor/plugins/toolbar/font-format-toolbar-plugin"
import { HistoryToolbarPlugin } from "@/components/editor/plugins/toolbar/history-toolbar-plugin"
import { HorizontalRuleToolbarPlugin } from "@/components/editor/plugins/toolbar/horizontal-rule-toolbar-plugin"
import { ImageToolbarPlugin } from "@/components/editor/plugins/toolbar/image-toolbar-plugin"
import { LinkToolbarPlugin } from "@/components/editor/plugins/toolbar/link-toolbar-plugin"
import { TableToolbarPlugin } from "@/components/editor/plugins/toolbar/table-toolbar-plugin"
import { ToolbarPlugin } from "@/components/editor/plugins/toolbar/toolbar-plugin"
import { HR } from "@/components/editor/transformers/markdown-hr-transformer"
import { IMAGE } from "@/components/editor/transformers/markdown-image-transformer"
import { TABLE } from "@/components/editor/transformers/markdown-table-transformer"

export type EditorMdPluginsProps = {
  placeholder?: string
  contentEditableClassName?: string
  placeholderClassName?: string
  allowUnderline?: boolean
  allowImages?: boolean
}

export function Plugins({
  placeholder = "Press / for commands...",
  contentEditableClassName =
  "ContentEditable__root relative block h-[calc(100vh-50px)] min-h-72 overflow-auto px-8 py-4 focus:outline-none",
  placeholderClassName =
  "text-muted-foreground pointer-events-none absolute top-0 left-0 overflow-hidden px-8 py-[18px] text-ellipsis select-none",
  allowUnderline = true,
  allowImages = true,
}: EditorMdPluginsProps) {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null)
  const [isLinkEditMode, setIsLinkEditMode] = useState<boolean>(false)

  type MarkdownTransformers = NonNullable<
    ComponentProps<typeof MarkdownShortcutPlugin>["transformers"]
  >

  const markdownTransformers = useMemo(() => {
    // NOTE: Lexical's markdown transformer typings are stricter than some of our
    // custom transformers (TABLE/HR/IMAGE). We cast the final list to match the
    // component's expected prop type.
    const head: unknown[] = [TABLE, HR]
    if (allowImages) head.push(IMAGE)
    head.push(CHECK_LIST)

    return [
      ...head,
      ...ELEMENT_TRANSFORMERS,
      ...MULTILINE_ELEMENT_TRANSFORMERS,
      ...TEXT_FORMAT_TRANSFORMERS,
      ...TEXT_MATCH_TRANSFORMERS,
    ] as unknown as MarkdownTransformers
  }, [allowImages])

  const componentPickerOptions = useMemo(() => {
    const options = [
      ParagraphPickerPlugin(),
      HeadingPickerPlugin({ n: 1 }),
      HeadingPickerPlugin({ n: 2 }),
      HeadingPickerPlugin({ n: 3 }),
      TablePickerPlugin(),
      CheckListPickerPlugin(),
      NumberedListPickerPlugin(),
      BulletedListPickerPlugin(),
      QuotePickerPlugin(),
      CodePickerPlugin(),
      DividerPickerPlugin(),
      ...(allowImages ? [ImagePickerPlugin()] : []),
      AlignmentPickerPlugin({ alignment: "left" }),
      AlignmentPickerPlugin({ alignment: "center" }),
      AlignmentPickerPlugin({ alignment: "right" }),
      AlignmentPickerPlugin({ alignment: "justify" }),
    ]

    return options
  }, [allowImages])

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  return (
    <div className="relative">
      <ToolbarPlugin>
        {({ blockType }) => (
          <div className="vertical-align-middle sticky top-0 z-10 flex max-w-sm sm:max-w-xl! items-center gap-2 overflow-x-auto overflow-y-hidden p-1 pt-0 no-scrollbar pr-8">
            <HistoryToolbarPlugin />
            <BlockFormatDropDown>
              <FormatParagraph />
              <FormatHeading levels={["h1", "h2", "h3"]} />
              <FormatNumberedList />
              <FormatBulletedList />
              <FormatCheckList />
              <FormatCodeBlock />
              <FormatQuote />
            </BlockFormatDropDown>
            {blockType === "code" ? (
              <CodeLanguageToolbarPlugin />
            ) : (
              <>
                <ElementFormatToolbarPlugin separator={false} />
                <FontFormatToolbarPlugin allowUnderline={allowUnderline} />
                <LinkToolbarPlugin setIsLinkEditMode={setIsLinkEditMode} />

                <HorizontalRuleToolbarPlugin />
                {allowImages ? <ImageToolbarPlugin /> : null}
                <TableToolbarPlugin />
              </>
            )}
          </div>
        )}
      </ToolbarPlugin>
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <div className="">
              <div className="" ref={onRef}>
                <ContentEditable
                  placeholder={placeholder}
                  className={contentEditableClassName}
                  placeholderClassName={placeholderClassName}
                />
              </div>
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />

        <ListPlugin />
        <ListMaxIndentLevelPlugin />
        <CheckListPlugin />

        <TabIndentationPlugin />

        <ClickableLinkPlugin />
        <AutoLinkPlugin />
        <LinkPlugin />

        <FloatingLinkEditorPlugin
          anchorElem={floatingAnchorElem}
          isLinkEditMode={isLinkEditMode}
          setIsLinkEditMode={setIsLinkEditMode}
        />

        <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />
        <CodeHighlightPlugin />

        <ComponentPickerMenuPlugin baseOptions={componentPickerOptions} />

        <FloatingTextFormatToolbarPlugin
          anchorElem={floatingAnchorElem}
          setIsLinkEditMode={setIsLinkEditMode}
        />

        <HorizontalRulePlugin />

        {allowImages ? <ImagesPlugin /> : null}

        <TablePlugin />

        {/* <DraggableBlockPlugin anchorElem={floatingAnchorElem} /> */}

        <MarkdownShortcutPlugin transformers={markdownTransformers} />
      </div>
    </div>
  )
}
