/**
 * @license MIT
 * @copyright Copyright 2026 Modus Operandi Inc. All Rights Reserved.
 */

// Plugin to handle Citation.
import { Plugin, Transaction, EditorState } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { Mark, Node, Schema } from 'prosemirror-model';
import { CitationView } from './CitationView';
import { CitationFooterView } from './CitationFooterView';
import {
  CapcoService,
  CITATION_NOTE,
  HIGHLIGHTDECO,
  Marking,
} from './Constants';
import { CitationNodeSpec } from './CitationNodeSpec';
import { applyEffectiveSchema } from './CitationSchema';
import {
  AddCitationCommand,
  removeTexthighlightMark,
} from './AddCitationCommand';
import {
  makeKeyMapWithCommon,
  createKeyMapPlugin,
} from '@modusoperandi/licit-doc-attrs-step';
import {
  citationBuilder,
  CitableMaterial,
  citationFields,
  CitationPluginOptions,
  CitationPluginState,
  pluginKey,
} from './Types';
import {
  POSITION_MODE_GLOBAL,
  POSITION_MODE_PARAGRAPH,
} from './CitationPosition';
export const KEY_CITATION: {
  description: string;
  windows: string;
  mac: string;
  common?: string;
} = makeKeyMapWithCommon('Citation', 'Mod-' + "'"); 

// Fix: Update the private plugin classes as a named export rather than the default
export class CitationPlugin extends Plugin<CitationPluginState> {
  addCitationCmd: AddCitationCommand;
  _view?: EditorView = undefined;

  constructor(private readonly opt?: CitationPluginOptions) {
    super({
      key: pluginKey,
      state: {
        init(_config, _state) {
          const { doc } = _state;
          this.spec.props.nodeViews[CITATION_NOTE] = (a, b, c) =>
            bindCitationView(
              a,
              b,
              c,
              opt?.addCitationOpt?.capcoService,
              opt?.addCitationOpt?.citationBuilder,
              opt?.addCitationOpt?.citableMaterial
            );
          return {
            ...opt,
            decorations: commentDeco(doc, _state, undefined),
            loaded: true,
          };
        },
        apply(tr, _prev, _, newState) {
          return {
            ..._prev,
            decorations: commentDeco(tr.doc, newState, tr),
            loaded: this.getState(newState)?.loaded,
          };
        },
      },
      view: (view) => {
        if (this.getState(view.state)?.showFootercitation) {
          return new CitationFooterView(view, this.addCitationCmd);
        }

        return {};
      },
      props: {
        handlePaste(view, event, _slice) {
          (this as CitationPlugin)._view = view;
          let retVal = false;
          const pos =
            view.state.selection.from < 2 ? 0 : view.state.selection.from - 2;
          const node = view.state.tr.doc.nodeAt(pos);
          if (CITATION_NOTE === node?.type.name) {
            event.preventDefault();
            retVal = true;
          }
          return retVal;
        },
        handleDrop(view, event, _slice, _moved) {
          (this as CitationPlugin)._view = view;
          const coords = { x: event.clientX, y: event.clientY };
          let retVal = false;
          if (coords) {
            const dropPos = view.posAtCoords({
              left: coords.x,
              top: coords.y,
            });
            if (dropPos?.pos && 0 <= dropPos.pos - 2) {
              const node = view.state.tr.doc.nodeAt(dropPos.pos - 2);
              if (CITATION_NOTE === node?.type.name) {
                event.preventDefault();
                retVal = true;
              }
            }
          }
          return retVal;
        },
        transformPastedHTML(html: string) {
          const parser = new DOMParser();
          const htmlDoc = parser.parseFromString(html, 'text/html');
          const citNodes = htmlDoc.body.querySelectorAll('citation');
          let citElement = null;

          if (citNodes.length > 0) {
            citNodes.forEach((element) => {
              citElement = (this as CitationPlugin).createCitationNotObject(
                element.attributes
              );
              element.replaceWith(citElement);
            });
          }
          return htmlDoc.body.outerHTML;
        },
        handleDOMEvents: {
          keydown(view, event) {
            (this as CitationPlugin)._view = view;
            let retVal = false;
            const pos =
              view.state.selection.from < 2 ? 0 : view.state.selection.from - 2;
            const node = view.state.tr.doc.nodeAt(pos);
            if (CITATION_NOTE === node?.type.name) {
              const allowedKeys = [
                'Enter',
                'ArrowRight',
                'ArrowLeft',
                'ArrowDown',
                'ArrowUp',
                'Backspace',
                '.',
                '&',
                '(',
              ];
              const ctrlKeys = ['a', 'y', 'z'];
              // [FS] IRAD-1419 2021-06-24
              // fix: Ctrl+A, F7 AND Ctrl+Z key codes are not working when the cursor is next to citation number
              if (
                allowedKeys.includes(event.key) ||
                (event.ctrlKey && ctrlKeys.includes(event.key))
              ) {
                if (
                  event.key === '.' ||
                  (event.key === 'Enter' &&
                    CITATION_NOTE ===
                    view.state.tr.doc.nodeAt(view.state.selection.from)?.type
                      .name)
                ) {
                  event.preventDefault();
                }
              } else {
                event.preventDefault();
                retVal = true;
              }
            } else if (
              CITATION_NOTE === view.state.selection.$anchor.nodeAfter?.type.name
            ) {
              event.preventDefault();
            }
            return retVal;
          },
        },
        nodeViews: {},
        decorations(state) {
          return this.getState(state)?.decorations;
        },
      },
      appendTransaction: (transactions, prevState, nextState) => {
        return this.handleAppendTransactions(
          transactions,
          prevState,
          nextState
        );
      },
      filterTransaction(tr: Transaction, _state: EditorState): boolean {
        // skip if the highlight thru collab
        return !isHighlightViaCollab(tr);
      },
    });
    this.addCitationCmd = new AddCitationCommand(opt?.addCitationOpt);
  } 

  handleAppendTransactions(
    transactions: readonly Transaction[],
    _prevState: EditorState,
    nextState: EditorState
  ): Transaction | null {

    if (!transactions.some(tr => tr.docChanged)) {
      return null;
    }

    if (
      !nextState?.doc ||
      typeof (nextState.doc as { descendants?: unknown }).descendants !==
        'function'
    ) {
      return null;
    }

    const tr = nextState.tr;
    let modified = false;

    nextState.doc.descendants((node, pos) => {
      if (node.type.name !== CITATION_NOTE) return;

      let paragraphPos = Number(node.attrs.paragraphPos);
      const from = Number(node.attrs.from);
      const to = Number(node.attrs.to);

      if (Number.isNaN(paragraphPos) || Number.isNaN(from) || Number.isNaN(to)) return;

      // 🔥 Step 1: compute absolute BEFORE mapping
      let absFrom = paragraphPos + from;
      let absTo = paragraphPos + to;

      // 🔥 Step 2: map absolute positions
      transactions.forEach(txn => {
        if (!txn.docChanged) return;
        absFrom = txn.mapping.map(absFrom, -1);
        absTo = txn.mapping.map(absTo, 1);
        paragraphPos = txn.mapping.map(paragraphPos, -1);
      });

      // 🔥 Step 3: recompute relative (this is the key fix)
      const newFrom = absFrom - paragraphPos;
      const newTo = absTo - paragraphPos;

      if (
        paragraphPos !== node.attrs.paragraphPos ||
        newFrom !== from ||
        newTo !== to
      ) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          paragraphPos,
          from: newFrom,
          to: newTo,
          positionMode: POSITION_MODE_PARAGRAPH,
        });
        modified = true;
      }
    });

    if (!modified) return null;

    tr.setMeta('addToHistory', false);
    return tr;
  }

  getRow(node, prevState, startPos, parentNode, parentPos, nextState, tr) {
    if (
      node &&
      'citationnote' === prevState.tr.doc.nodeAt(startPos).type.name
    ) {
      let themarkPos = 0;
      themarkPos = parentPos;
      if (parentNode) {
        const markObj = this.findMarkObject(
          parentNode,
          themarkPos,
          node.attrs.from
        );
        if (markObj) {
          tr = nextState.tr;
          return removeTexthighlightMark(
            tr,
            nextState,
            markObj.pos,
            markObj.pos + markObj.diff
          );
        }
      }
    }
    return null;
  }

  findMarkObject(parentNode, themarkPos, from) {
    const citationmarkNode: {
      pos: number;
      marks: readonly Mark[];
      diff: number;
    }[] = [];
    parentNode.descendants((child, pos) => {
      if (child.marks.length > 0) {
        citationmarkNode.push({
          pos: pos + themarkPos + 1,
          marks: child.marks,
          diff: child ? child.nodeSize : 0,
        });
      }
    });

    const relativeFrom = Number(from);
    const absoluteFrom = Number.isNaN(relativeFrom)
      ? relativeFrom
      : relativeFrom + themarkPos + 1;

    return citationmarkNode.find((obj) => {
      const markPos = Number(obj.marks[0].attrs.pos);
      return markPos === absoluteFrom || markPos === relativeFrom;
    });
  }

  getEffectiveSchema(schema: Schema): Schema {
    schema = applyEffectiveSchema(schema);
    const nodes = schema.spec.nodes.addToEnd('citationnote', CitationNodeSpec);
    const marks = schema.spec.marks;
    schema = new Schema({ nodes, marks });

    return schema;
  }

  initKeyCommands(): unknown {
    return createKeyMapPlugin(
      {
        [(this.opt?.citationKey ?? KEY_CITATION).common]:
          this.addCitationCmd.executeWithUserInput,
      },
      'CitationKeyMap'
    );
  }

  createCitationNotObject(Nodeattrs: NamedNodeMap) {
    const newCitationTag = document.createElement(CITATION_NOTE);
    const getAttrValue = (name: string): string => {
      if (typeof Nodeattrs?.getNamedItem === 'function') {
        return Nodeattrs.getNamedItem(name)?.value ?? '';
      }
      const raw = (Nodeattrs as unknown as Record<string, unknown>)[name];
      return typeof raw === 'string' ? raw : '';
    };

    citationFields.forEach((field) =>
      newCitationTag.setAttribute(field, getAttrValue(field))
    );

    newCitationTag.setAttribute(
      'from',
      getAttrValue('posfrom') || getAttrValue('from')
    );
    newCitationTag.setAttribute(
      'to',
      getAttrValue('posto') || getAttrValue('to')
    );
    newCitationTag.setAttribute(
      'positionMode',
      getAttrValue('positionMode') || POSITION_MODE_GLOBAL
    );

    newCitationTag.setAttribute('class', 'citationnote');
    newCitationTag.setAttribute('contenteditable', 'false');
    return newCitationTag;
  }

  initButtonCommands(): {
    '[format_quote] Add citation': AddCitationCommand;
  } {
    return {
      '[format_quote] Add citation': this.addCitationCmd,
    };
  }

  public static createCitation(
    state: EditorState,
    dispatch: (tr: Transaction) => void,
    view: EditorView
  ): boolean {
    const plugin = new CitationPlugin();
    return plugin.addCitationCmd.execute(state, dispatch, view);
  }
} 

export function isHighlightViaCollab(tr: Transaction) {
  let viaCollab = false;
  let isHighlight = false;

  viaCollab = !!tr.getMeta('collab$');
  if (viaCollab) {
    isHighlight = !!tr.getMeta(HIGHLIGHTDECO);
  }

  return isHighlight && viaCollab;
}

export function commentDeco(doc: Node, state: EditorState, tr: Transaction) {
  const decos = [];
  decos.push(
    Decoration.inline(state.selection.from, state.selection.to, {
      class: 'problem',
    })
  );
  if (tr) {
    let d = tr.getMeta(HIGHLIGHTDECO);
    if (!d) {
      const t = tr.getMeta('appendedTransaction');
      if (t) {
        d = t.getMeta(HIGHLIGHTDECO);
      }
    }
    if (d) {
      decos.push(d);
    }
  }
  return 0 < decos.length ? DecorationSet.create(doc, decos) : null;
}

function bindCitationView(
  node: Node,
  view: EditorView,
  curPos: () => number,
  capcoService: CapcoService<Marking>,
  citationBuilder?: citationBuilder,
  citableMaterial?: CitableMaterial[]
): CitationView {
  return new CitationView(
    node,
    view,
    curPos,
    capcoService,
    citationBuilder,
    citableMaterial
  );
}
