import {
  constFunction,
  constNodeUnsafe,
  isFunctionLiteral,
  varNode,
  voidNode,
  Node,
  opStringEqual,
  constString,
  opIndex,
  opPick,
  pickSuggestions,
  opUnique,
  NodeOrVoidNode,
  opAnd,
  isAssignableTo,
  maybe,
  Type,
  opStringNotEqual,
  opNumberEqual,
  opNumberNotEqual,
  opNumberLess,
  opNumberLessEqual,
  opNumberGreater,
  opNumberGreaterEqual,
  opBooleanEqual,
  opBooleanNotEqual,
  constNumber,
  constBoolean,
  opOr,
  // opLimit,
} from '@wandb/weave/core';
import * as _ from 'lodash';
import React, {useCallback, useMemo, useState} from 'react';

import {WeaveExpression} from '../../panel/WeaveExpression';
import {useMutation, useNodeValue} from '../../react';
import * as Panel2 from './panel';
import {PanelContextProvider} from './PanelContext';
import {Button, Popup} from 'semantic-ui-react';
import ModifiedDropdown from '@wandb/weave/common/components/elements/ModifiedDropdown';
import LinkButton from '@wandb/weave/common/components/LinkButton';
import NumberInput from '@wandb/weave/common/components/elements/NumberInput';

const inputType = {
  type: 'function' as const,
  inputTypes: {},
  outputType: 'any' as const,
};
interface PanelFilterEditorConfig {
  node: Node;
}

type PanelFilterEditorProps = Panel2.PanelProps<
  typeof inputType,
  PanelFilterEditorConfig
>;

interface VisualClauseString {
  key: string;
  simpleKeyType: 'string';
  op: '=' | '!=';
  value: string;
}

interface VisualClauseStringIn {
  key: string;
  simpleKeyType: 'string';
  op: 'in';
  value: string[];
}
interface VisualClauseBoolean {
  key: string;
  simpleKeyType: 'boolean';
  op: '=' | '!=';
  value: boolean;
}

interface VisualClauseNumber {
  key: string;
  simpleKeyType: 'number';
  op: '=' | '!=' | '<' | '<=' | '>' | '>=';
  value: number;
}

type VisualClause =
  | VisualClauseString
  | VisualClauseStringIn
  | VisualClauseBoolean
  | VisualClauseNumber;

interface VisualClauseWorkingState {
  key: string | undefined;
  simpleKeyType: 'number' | 'string' | 'boolean' | 'other';
  op: string | undefined;
  value: string | string[] | number | boolean | undefined;
}

const visualClauseIsValid = (
  clause: VisualClauseWorkingState
): clause is VisualClause => {
  if (clause.key == null || clause.op == null) {
    return false;
  }
  if (clause.simpleKeyType === 'number' && typeof clause.value !== 'number') {
    return false;
  }
  if (clause.simpleKeyType === 'string') {
    if (clause.op === 'in') {
      if (!Array.isArray(clause.value) || !clause.value.every(_.isString)) {
        return false;
      }
    } else if (typeof clause.value !== 'string') {
      return false;
    }
  }
  if (clause.simpleKeyType === 'boolean' && typeof clause.value !== 'boolean') {
    return false;
  }
  return true;
};

const getSimpleKeyType = (keyType: Type) => {
  return isAssignableTo(keyType, maybe('string'))
    ? 'string'
    : isAssignableTo(keyType, maybe('number'))
    ? 'number'
    : isAssignableTo(keyType, maybe('boolean'))
    ? 'boolean'
    : 'other';
};

const getOpChoices = (
  simpleKeyType: 'string' | 'number' | 'boolean' | 'other'
) => {
  return simpleKeyType === 'boolean'
    ? ['=', '!=']
    : simpleKeyType === 'string'
    ? ['=', '!=', 'in']
    : simpleKeyType === 'number'
    ? ['=', '!=', '<', '<=', '>', '>=']
    : [];
};

const SingleFilterVisualEditor: React.FC<{
  listNode: Node;
  clause: VisualClause | null;
  onCancel: () => void;
  onOK: (clause: VisualClause) => void;
}> = props => {
  const defaultKey = props.clause?.key;
  const defaultOp = props.clause?.op;
  const defaultValue = props.clause?.value;

  const listItem = opIndex({
    arr: props.listNode,
    index: varNode('number', 'n'),
  });
  const keyChoices = pickSuggestions(listItem.type).filter(
    k =>
      getSimpleKeyType(opPick({obj: listItem, key: constString(k)}).type) !==
      'other'
  );
  const keyOptions = keyChoices.map(k => ({text: k, value: k, k}));

  const [key, setKey] = useState<string | undefined>(
    defaultKey ?? keyChoices[0]
  );
  const [op, setOp] = useState<string | undefined>(defaultOp);
  const [value, setValue] = useState<any | undefined>(defaultValue);

  const simpleKeyType = getSimpleKeyType(
    opPick({
      obj: listItem,
      key: constString(key ?? ''),
    }).type
  );

  const opChoices = getOpChoices(simpleKeyType);
  const opOptions = opChoices.map(k => ({text: k, value: k, k}));

  // const valueQuery =
  // TODO: opLimit is broken in weave python when we have an ArrowWeaveList...
  // I think because we don't have opUnique?
  //   key != null
  //     ? opLimit({
  //         arr: opUnique({
  //           arr: opPick({obj: props.listNode, key: constString(key)}),
  //         }),
  //         limit: constNumber(500),
  //       })
  //     : voidNode();
  const valueQuery =
    key != null && simpleKeyType === 'string'
      ? opUnique({
          arr: opPick({obj: props.listNode, key: constString(key)}),
        })
      : voidNode();
  const valueChoices = useNodeValue(valueQuery).result ?? [];
  const valueOptions = valueChoices
    .filter((v: any) => v != null)
    .map((v: boolean | string | number) => ({
      text: v.toString(),
      value: v,
      key: v.toString(),
    }));

  const curClause: VisualClauseWorkingState = {key, simpleKeyType, op, value};
  const valid = visualClauseIsValid(curClause);

  return (
    <div>
      <ModifiedDropdown
        value={key}
        onChange={(e, {value: k}) => {
          const newKey = k as string;
          const newSimpleKeyType = getSimpleKeyType(
            opPick({
              obj: listItem,
              key: constString(newKey),
            }).type
          );
          const newOpChoices = getOpChoices(newSimpleKeyType);
          setKey(newKey);
          setOp(newOpChoices[0]);
          setValue(undefined);
        }}
        options={keyOptions}
        selection
      />
      <ModifiedDropdown
        value={op}
        onChange={(e, {value: v}) => {
          if (v === 'in') {
            setValue([]);
          } else {
            setValue(undefined);
          }
          setOp(v as string);
        }}
        options={opOptions}
        selection
      />
      {simpleKeyType === 'number' ? (
        <NumberInput
          value={value}
          onChange={newVal => {
            setValue(newVal);
          }}
        />
      ) : (
        <ModifiedDropdown
          value={value}
          multiple={op === 'in'}
          onChange={(e, {value: v}) => {
            setValue(v);
          }}
          options={valueOptions}
          selection
        />
      )}
      <Button onClick={props.onCancel}>Cancel</Button>
      <Button
        disabled={!valid}
        onClick={() => {
          if (valid) {
            props.onOK(curClause);
          } else {
            // Shouldn't really happen since we filter above.
            props.onCancel();
          }
        }}>
        OK
      </Button>
    </div>
  );
};

const clauseNodeToVisualStringIn = (
  clause: Node
): VisualClauseStringIn | null => {
  const inValues: string[] = [];
  let key: string | undefined;
  const addClauseValue = (node: Node) => {
    const singleClause = clauseNodeToVisual(node);
    if (singleClause == null) {
      return false;
    }
    if (singleClause.simpleKeyType !== 'string') {
      return false;
    }
    if (singleClause.op === 'in') {
      return false;
    }
    if (key == null) {
      key = singleClause.key;
    } else if (key !== singleClause.key) {
      return false;
    }
    inValues.push(singleClause.value);
    return true;
  };
  while (true) {
    if (clause.nodeType !== 'output') {
      return null;
    }
    const op = clause.fromOp;
    if (op.name === 'or') {
      if (!addClauseValue(op.inputs.rhs)) {
        return null;
      }
      clause = op.inputs.lhs;
    } else {
      if (!addClauseValue(clause)) {
        return null;
      }
      break;
    }
  }
  if (key == null) {
    return null;
  }
  return {
    key,
    simpleKeyType: 'string',
    op: 'in',
    value: inValues,
  };
};

const clauseNodeToVisual = (clause: Node): VisualClause | null => {
  if (clause.nodeType !== 'output') {
    return null;
  }
  const op = clause.fromOp;
  let opString;
  if (op.name === 'or') {
    return clauseNodeToVisualStringIn(clause);
  }
  if (['string-equal', 'boolean-equal', 'number-equal'].includes(op.name)) {
    opString = '=';
  } else if (
    ['string-notEqual', 'boolean-notEqual', 'number-notEqual'].includes(op.name)
  ) {
    opString = '!=';
  } else if (op.name === 'number-less') {
    opString = '<';
  } else if (op.name === 'number-lessEqual') {
    opString = '<=';
  } else if (op.name === 'number-greater') {
    opString = '>';
  } else if (op.name === 'number-greaterEqual') {
    opString = '>=';
  } else {
    return null;
  }
  const lhs = op.inputs.lhs;
  if (lhs.nodeType !== 'output') {
    return null;
  }
  if (lhs.fromOp.name !== 'pick') {
    return null;
  }
  const simpleKeyType = getSimpleKeyType(lhs.type);
  if (simpleKeyType === 'other') {
    return null;
  }
  if (lhs.fromOp.inputs.key.nodeType !== 'const') {
    return null;
  }
  const key = lhs.fromOp.inputs.key.val;
  const rhs = op.inputs.rhs;
  if (rhs.nodeType !== 'const') {
    return null;
  }
  const value = rhs.val;
  return {key, simpleKeyType, op: opString as any, value};
};

const filterExpressionToVisualClauses = (
  expr: NodeOrVoidNode
): VisualClause[] | null => {
  if (expr.nodeType === 'void') {
    return [];
  }
  if (expr.nodeType === 'const' && expr.val === true) {
    return [];
  }
  if (expr.nodeType !== 'output') {
    return null;
  }
  if (expr.fromOp.name !== 'and') {
    const singleVisualClause = clauseNodeToVisual(expr);
    if (singleVisualClause == null) {
      return null;
    }
    return [singleVisualClause];
  }
  const lhs = filterExpressionToVisualClauses(expr.fromOp.inputs.lhs);
  if (lhs == null) {
    return null;
  }
  const rhs = filterExpressionToVisualClauses(expr.fromOp.inputs.rhs);
  if (rhs == null) {
    return null;
  }
  return [...lhs, ...rhs];
};

const visualClausesToFilterExpression = (
  clauses: VisualClause[],
  listItemType: Type
) => {
  return clauses.reduce((expr, visualClause) => {
    const keyNode = opPick({
      obj: varNode(listItemType, 'row'),
      key: constString(visualClause.key),
    });
    let compOp;
    let valueNode;
    let clause;
    if (visualClause.op === 'in') {
      const val = visualClause.value as string[];
      if (val.length === 0) {
        return constNodeUnsafe('boolean', false);
      }
      clause = opStringEqual({
        lhs: keyNode,
        rhs: constString(val[0]),
      });
      for (let i = 1; i < val.length; i++) {
        const clauseI = opStringEqual({
          lhs: keyNode,
          rhs: constString(val[i]),
        });
        clause = opOr({
          lhs: clause,
          rhs: clauseI,
        });
      }
    } else {
      if (visualClause.simpleKeyType === 'string') {
        if (visualClause.op === '=') {
          compOp = opStringEqual;
        } else if (visualClause.op === '!=') {
          compOp = opStringNotEqual;
        }
        valueNode = constString(visualClause.value);
      } else if (visualClause.simpleKeyType === 'number') {
        if (visualClause.op === '=') {
          compOp = opNumberEqual;
        } else if (visualClause.op === '!=') {
          compOp = opNumberNotEqual;
        } else if (visualClause.op === '<') {
          compOp = opNumberLess;
        } else if (visualClause.op === '<=') {
          compOp = opNumberLessEqual;
        } else if (visualClause.op === '>') {
          compOp = opNumberGreater;
        } else if (visualClause.op === '>=') {
          compOp = opNumberGreaterEqual;
        }
        valueNode = constNumber(visualClause.value);
      } else if (visualClause.simpleKeyType === 'boolean') {
        if (visualClause.op === '=') {
          compOp = opBooleanEqual;
        } else if (visualClause.op === '!=') {
          compOp = opBooleanNotEqual;
        }
        valueNode = constBoolean(visualClause.value);
      }
      if (compOp == null) {
        throw new Error('Invalid visual clause');
      }
      clause = compOp({
        lhs: keyNode,
        rhs: valueNode as any,
      });
    }
    if (expr.nodeType === 'const' && expr.val === true) {
      return clause;
    }
    return opAnd({
      lhs: expr,
      rhs: clause,
    });
  }, constNodeUnsafe('boolean', true) as Node);
};

const addVisualClause = (
  clauses: VisualClause[],
  newClause: VisualClause
): VisualClause[] => {
  return [...clauses, newClause];
};

const setVisualClauseIndex = (
  clauses: VisualClause[],
  index: number,
  newClause: VisualClause
): VisualClause[] => {
  return [...clauses.slice(0, index), newClause, ...clauses.slice(index + 1)];
};

const removeVisualClause = (
  clauses: VisualClause[],
  index: number
): VisualClause[] => {
  return [...clauses.slice(0, index), ...clauses.slice(index + 1)];
};

const FilterPill = (props: {
  clause: VisualClause;
  onClick: () => void;
  onRemove: () => void;
}) => {
  const {clause} = props;
  const valueStr = _.isArray(clause.value)
    ? clause.value.join(', ')
    : clause.value;
  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: 8,
        backgroundColor: '#eee',
        padding: '4px 16px',
        cursor: 'pointer',
        position: 'relative',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '90%',
        overflow: 'hidden',
      }}
      onClick={props.onClick}>
      <div style={{marginRight: 4}}>{clause.key}</div>
      <div style={{marginRight: 4}}>{clause.op}</div>
      <div>{valueStr}</div>
    </div>
  );
};

const FilterPillBlock = (props: {
  clause: VisualClause;
  onClick: () => void;
  onRemove: () => void;
}) => {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      style={{marginBottom: 4, display: 'flex', alignItems: 'center'}}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}>
      <FilterPill
        clause={props.clause}
        onClick={props.onClick}
        onRemove={props.onRemove}
      />
      <div
        style={{
          display: hover ? 'block' : 'none',
          marginLeft: 8,
          cursor: 'pointer',
        }}
        onClick={props.onRemove}>
        x
      </div>
    </div>
  );
};

export const PanelFilterEditor: React.FC<PanelFilterEditorProps> = props => {
  const listItem = opIndex({
    arr: props.config!.node,
    index: varNode('number', 'n'),
  });
  const valueNode = props.input;
  const valueQuery = useNodeValue(valueNode, {callSite: 'PanelFilterEditor'});
  const value = valueQuery.loading
    ? constFunction({}, () => voidNode() as any)
    : valueQuery.result;
  const setVal = useMutation(valueNode, 'set');
  const [mode, setMode] = React.useState<'visual' | 'expression'>('visual');
  const [editingFilterIndex, setEditingFilterIndex] = React.useState<
    number | null
  >(null);

  const visualClauses =
    value.nodeType === 'const'
      ? filterExpressionToVisualClauses(value.val)
      : null;
  const actualMode = visualClauses == null ? 'expression' : mode;

  if (!isFunctionLiteral(value)) {
    throw new Error('Expected function literal');
  }

  const inputTypes = value.type.inputTypes;

  const updateVal = useCallback(
    (newVal: any) => {
      // console.log('SET VAL NEW VAL', newVal);
      setVal({
        // Note we have to double wrap in Const here!
        // We are editing a Weave function with expression editor.
        // A weave function is Const(FunctionType(), Node). It must be
        // stored that way, we need FunctionType()'s input types to know
        // the input names and order for our function.
        // The first wrap with const node is to convert the Node edited
        // By WeaveExpression to our function format.
        // The second wrap is so that when the weave_api.set resolver runs
        // We still have our function format!
        val: constNodeUnsafe(
          'any',
          constNodeUnsafe(
            {
              type: 'function',
              inputTypes,
              outputType: newVal.type,
            },
            newVal
          )
        ),
      });
    },
    [setVal, inputTypes]
  );

  const updateValFromVisualClauses = useCallback(
    (clauses: VisualClause[]) => {
      const newExpr = visualClausesToFilterExpression(clauses, listItem.type);
      updateVal(newExpr);
    },
    [listItem.type, updateVal]
  );

  const paramVars = useMemo(
    () => _.mapValues(inputTypes, (type, name) => varNode(type, name)),
    [inputTypes]
  );

  if (valueQuery.loading) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{width: '100%', height: '100%', paddingLeft: 16}}>
      <div style={{display: 'flex', alignItems: 'center'}}>
        <div
          style={{
            marginRight: 8,
            color: visualClauses == null ? '#aaa' : undefined,
            textDecoration: actualMode === 'visual' ? 'underline' : undefined,
            cursor: 'pointer',
          }}
          onClick={() => visualClauses != null && setMode('visual')}>
          visual
        </div>
        <div> | </div>
        <div
          style={{
            marginLeft: 8,
            textDecoration:
              actualMode === 'expression' ? 'underline' : undefined,
            cursor: 'pointer',
          }}
          onClick={() => setMode('expression')}>
          expression
        </div>
      </div>
      {mode === 'expression' || visualClauses == null ? (
        <PanelContextProvider newVars={paramVars}>
          <WeaveExpression expr={value.val} setExpression={updateVal} noBox />
        </PanelContextProvider>
      ) : (
        <div>
          {visualClauses.map((clause, i) => (
            <Popup
              key={i}
              position="right center"
              trigger={
                <FilterPillBlock
                  clause={clause}
                  onClick={() => setEditingFilterIndex(i)}
                  onRemove={() => {
                    updateValFromVisualClauses(
                      removeVisualClause(visualClauses, i)
                    );
                  }}
                />
              }
              open={editingFilterIndex === i}
              content={
                <SingleFilterVisualEditor
                  listNode={props.config!.node}
                  clause={clause}
                  onCancel={() => setEditingFilterIndex(null)}
                  onOK={newClause => {
                    setEditingFilterIndex(null);
                    updateValFromVisualClauses(
                      setVisualClauseIndex(visualClauses, i, newClause)
                    );
                  }}
                />
              }
            />
          ))}
          <Popup
            position="right center"
            open={editingFilterIndex === -1}
            trigger={
              <div>
                {/* TODO: this LinkButton is really bad, it's just a span. 
                    Use something better
                */}
                <LinkButton
                  style={{cursor: 'pointer'}}
                  onClick={() => {
                    setEditingFilterIndex(-1);
                  }}>
                  + Add filter
                </LinkButton>
              </div>
            }
            content={
              <SingleFilterVisualEditor
                listNode={props.config!.node}
                clause={null}
                onCancel={() => setEditingFilterIndex(null)}
                onOK={newClause => {
                  setEditingFilterIndex(null);
                  updateValFromVisualClauses(
                    addVisualClause(visualClauses, newClause)
                  );
                }}
              />
            }
          />
        </div>
      )}
    </div>
  );
};

export const Spec: Panel2.PanelSpec = {
  hidden: true,
  id: 'FilterEditor',
  Component: PanelFilterEditor,
  inputType,
};