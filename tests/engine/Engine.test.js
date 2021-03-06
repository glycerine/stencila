import test from 'tape'
import { isArray } from 'substance'
import Engine from '../../src/engine/Engine'
import JsContext from '../../src/contexts/JsContext'
import MiniContext from '../../src/contexts/MiniContext'
import FunctionManager from '../../src/function/FunctionManager'
import { libtestXML, libtest } from '../contexts/libtest'
import { UNKNOWN, toString as cellStatusToString } from '../../src/engine/CellStates'
import { RuntimeError } from '../../src/engine/CellErrors'

test('Engine: simple sheet', t=> {
  t.plan(1)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    // default lang
    lang: 'mini',
    cells: [
      ['1', '= A1 * 2'],
      ['2', '= A2 * 2']
    ]
  })
  _play(engine)
  .then(() => {
    t.deepEqual(_getValues(sheet.queryCells('B1:B2')), [2,4], 'values should have been computed')
  })
})

test('Engine: simple doc', t => {
  t.plan(1)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      'x = 2',
      'y = 3',
      'z = x + y'
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    t.deepEqual(_getValues(cells), [2,3,5], 'values should have been computed')
  })
})

test('Engine: single cell', t => {
  t.plan(9)
  let { engine, graph } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      '1+2'
    ]
  })
  let cells = doc.getCells()
  const cell = cells[0]
  const id = cell.id
  _cycle(engine)
  .then(() => {
    let nextActions = engine.getNextActions()
    t.equal(nextActions.size, 1, 'There should be one next action')
    let a = nextActions.get(id)
    t.equal(a.type, 'register', '.. which should a registration action')
    t.equal(cell.status, UNKNOWN, 'cell state should be UNKNOWN')
  })
  .then(() => _cycle(engine))
  .then(() => {
    t.ok(graph.hasCell(id), 'The cell should now be registered')
    let nextActions = engine.getNextActions()
    let a = nextActions.get(id)
    t.equal(a.type, 'evaluate', 'next action should be evaluate')
  })
  .then(() => _cycle(engine))
  .then(() => {
    let nextActions = engine.getNextActions()
    let a = nextActions.get(id)
    t.equal(a.type, 'update', 'next action should be update')
  })
  .then(() => _cycle(engine))
  .then(() => {
    let nextActions = engine.getNextActions()
    t.equal(nextActions.size, 0, 'There should be no pending actions')
    t.notOk(cell.hasErrors(), 'the cell should have no error')
    t.equal(_getValue(cell), 3, 'the value should have been computed correctly')
  })
})

test('Engine: sheet', t=> {
  t.plan(4)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    // default lang
    lang: 'mini',
    cells: [
      ['1', '= A1 * 2'],
      ['2', '= A2 * 2']
    ]
  })
  let [ [, cell2], [, cell4] ] = sheet.getCells()
  _cycle(engine)
  .then(() => {
    _checkActions(t, engine, [cell2, cell4], ['register', 'register'])
  })
  .then(() => {
    return _cycle(engine)
  })
  .then(() => {
    _checkActions(t, engine, [cell2, cell4], ['evaluate', 'evaluate'])
  })
  .then(() => {
    return _cycle(engine)
  })
  .then(() => {
    _checkActions(t, engine, [cell2, cell4], ['update', 'update'])
  })
  .then(() => {
    return _cycle(engine)
  })
  .then(() => {
    t.deepEqual(_getValues([cell2, cell4]), [2,4], 'values should have been computed')
  })
})

test('Engine: range expression', t=> {
  t.plan(4)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2', '= A1:B1'],
      ['3', '4', '= B2:B2'],
      ['= A1:A2', '6', '= A1:B2'],
    ]
  })
  let [ [,,cell1], [,,cell2], [cell3,,cell4] ] = sheet.getCells()
  _cycle(engine)
  .then(() => {
    _checkActions(t, engine, [cell1, cell2, cell3, cell4], ['register', 'register','register', 'register'])
    return _cycle(engine)
  })
  // an extra cycle because a RangeCell is a proxy to the referenced cells
  // and to propagate he gathered values
  .then(() => {
    return _cycle(engine)
  })
  // and another cycle to get the mini cells evaluated
  .then(() => {
    // Note: that 'B2:B2' is treated as a cell reference, and thus it does not need to be evaluated
    _checkActions(t, engine, [cell1, cell2, cell3, cell4], ['evaluate', 'update','evaluate', 'evaluate'])
    return _cycle(engine)
  })
  // and another one to update the values
  .then(() => {
    _checkActions(t, engine, [cell1, cell2, cell3, cell4], ['update', undefined, 'update','update'])
    return _cycle(engine)
  })
  .then(() => {
    t.deepEqual(
      _getValues([cell1, cell2, cell3, cell4]),
      [[1,2], 4, [1,3], {"type":"table","data":{"A":[1,3],"B":[2,4]},"columns":2,"rows":2}],
      'values should have been computed'
    )
  })
})

/*
  Scenario:
  1. create a doc with two cells 'x = 1' and 'x = 2'
    -> now there should be an error because of the name collision
  2. update both cells (not resolving the issue)
    -> both should still have the same error
*/
test('Engine: graph errors should not be cleared without resolving', t => {
  t.plan(2)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 1' },
      { id: 'cell2', source: 'x = 2' }
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    t.deepEqual(_getErrors(cells), [['collision'], ['collision']], 'Both cells should have a collision error.')
  })
  .then(() => {
    doc.updateCell('cell1', { source: 'x =  1'})
    doc.updateCell('cell2', { source: 'x = 3'})
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getErrors(cells), [['collision'], ['collision']], 'still both cells should have a collision error.')
  })
})

test('Engine: runtime errors should be wiped when inputs are updated', t => {
  t.plan(2)
  let { engine, graph } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 1' },
      { id: 'cell2', source: 'y = x' }
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    t.equal(_getValue(cells[1]), 1, 'y should be computed.')
    graph.addError(cells[1].id, new RuntimeError('Ooops'))
  })
  .then(() => _play(engine))
  .then(() => {
    doc.updateCell('cell1', { source: 'x = 2' })
  })
  .then(() => _play(engine))
  .then(() => {
    t.equal(_getValue(cells[1]), 2, 'y should be updated.')
  })
})

test('Engine (Document): inserting a cell', t => {
  t.plan(1)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 2' },
      { id: 'cell2', source: 'z = 3*x' }
    ]
  })
  _play(engine)
  .then(() => {
    doc.insertCellAt(1, { id: 'cell3', source: 'y = x + 1' })
  })
  .then(() => _play(engine))
  .then(() => {
    doc.updateCell('cell1', { source: 'x = 2' })
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(doc.getCells()), [2,3,6], 'values should have been computed')
  })
})

test('Engine (Document): removing a cell', t => {
  t.plan(1)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 2' },
      { id: 'cell2', source: 'y = 3*x' },
      { id: 'cell3', source: 'z = 2*y' }
    ]
  })
  _play(engine)
  .then(() => {
    doc.removeCell('cell2')
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getErrors(doc.getCells()), [[],['unresolved']], 'cell3 should be broken now')
  })
})

test('Engine (Document): updating a cell', t => {
  t.plan(1)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      { id: 'cell1', source: 'x = 2' },
    ]
  })
  _play(engine)
  .then(() => {
    doc.updateCell('cell1', 'x = 21')
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(doc.getCells()), [21], 'cell should have been updated')
  })
})

test('Engine (Sheet): column names', t => {
  t.plan(2)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    columns: [
      { name: 'x' },
      { name: 'y' },
    ],
    cells: [
      [ '1', '2'],
      [ '3', '4']
    ]
  })
  t.equal(sheet.getColumnName(0), 'x', 'first column name should be correct')
  t.equal(sheet.getColumnName(1), 'y', 'second column name should be correct')
})

test('Engine (Sheet): cell expressions', t => {
  t.plan(2)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['= A1 + 1', '= B1 + 1']
    ]
  })
  let cells = sheet.getCells()
  _play(engine)
  .then(() => {
    t.deepEqual(_getValues(cells[1]), [2,3], 'values should have been computed')
  })
  .then(() => {
    // TODO: still the difference between qualified vs unqualified id
    // is sometimes confusing
    // Note: Document and Sheet API uses unqualified ids (local to the resource, like 'A1')
    // while the engine and the graph uses qualified ids (globally unique, like 'sheet1!A1').
    sheet.updateCell(cells[0][0].unqualifiedId, '3')
    sheet.updateCell(cells[0][1].unqualifiedId, '4')
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(cells[1]), [4,5], 'values should have been computed')
  })
})

test('Engine: changing a range expression', t=> {
  // Note: internally we instantiate a proxy cell
  // which should be pruned automatically if it is not needed anymore
  t.plan(4)
  let { engine, graph } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [['1'],['2'],['3'],['= A1:A2']]
  })
  let [,,,[cell4]] = sheet.getCells()
  _play(engine)
  .then(() => {
    t.ok(graph.hasCell('sheet1!A1:A2'), 'a range cell should be registered')
    t.deepEqual(_getValue(cell4), [1,2], 'range expression should be evaluated')
  })
  .then(() => {
    sheet.updateCell(cell4.unqualifiedId, '= A1:A3')
  })
  .then(() => _play(engine))
  .then(() => {
    t.notOk(graph.hasCell('sheet1!A1:A2'), 'the former range cell should have been pruned')
    t.deepEqual(_getValue(cell4), [1,2,3], 'range expression should be updated')
  })
})

test('Engine: inverse range expression are normalized', t=> {
  t.plan(1)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['= A2:A1', '= B1:A1']
    ]
  })
  let cells = sheet.getCells()
  _play(engine)
  .then(() => {
    t.deepEqual(_getValues(cells[2]), [[1,3], [1,2]], 'values should be in normal order')
  })
})

test('Engine: no context for lang', t => {
  t.plan(1)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'foo',
    cells: [
      'x = 2'
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    t.deepEqual(_getErrors(cells), [['context']], 'there should an error about missing context')
  })
})

test('Engine: lost context', t => {
  t.plan(2)
  let { engine, host } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      'x = 2'
    ]
  })
  let cells = doc.getCells()
  _cycle(engine)
  .then(() => _cycle(engine))
  .then(() => {
    // now the cell should be scheduled for evaluation
    _checkActions(t, engine, cells, ['evaluate'])
    // and there we pretend a lost connection
    host._disable(true)
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getErrors(cells), [['context']], 'there should an error about missing context')
  })
})

test('Engine: transclusion', t => {
  t.plan(2)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    cells: [
      'x = sheet1!A3',
      'x * 2'
    ]
  })
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['= A1 + A2', '= B1 + B2']
    ]
  })
  let docCells = doc.getCells()
  let sheetCells = sheet.getCells()
  _play(engine)
  .then(() => {
    t.deepEqual(_getValues(docCells), [4, 8], 'document cells should have been computed')
  })
  .then(() => {
    sheet.updateCell(sheetCells[0][0].unqualifiedId, '5')
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(docCells), [8, 16], 'document cells should have been computed')
  })
})

test('Engine: manual execution', t => {
  t.plan(3)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      'x = 2',
      'x * 3'
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    t.deepEqual(_getStates(cells), ['ready', 'waiting'], 'cell states should be correct')
  })
  .then(() => {
    engine._allowRunningCell(cells[0].id)
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getStates(cells), ['ok', 'ready'], 'cell states should be correct')
  })
  .then(() => {
    engine._allowRunningCell(cells[1].id)
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(cells), [2, 6], 'cells should have been computed')
  })
})

test('Engine: manually run cell and predecessors', t => {
  t.plan(1)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      'x = 2',
      'y = x * 3',
      'z = y + 2'
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    engine._allowRunningCellAndPredecessors(cells[2].id)
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(cells), [2, 6, 8], 'cells should have been computed')
  })
})

test('Engine: run all cells in manual execution mode', t => {
  t.plan(1)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      'x = 2',
      'y = x * 3',
      'z = y + 2'
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    engine._allowRunningAllCellsOfDocument('doc1')
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(cells), [2, 6, 8], 'cells should have been computed')
  })
})

test('Engine: cells with errors should not be scheduled (manual mode)', t => {
  t.plan(3)
  let { engine } = _setup()
  let doc = engine.addDocument({
    id: 'doc1',
    lang: 'mini',
    autorun: false,
    cells: [
      '6 * 2',
    ]
  })
  let cells = doc.getCells()
  _play(engine)
  .then(() => {
    engine._allowRunningAllCellsOfDocument('doc1')
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(cells), [12], 'cells should have been computed')
  })
  .then(() => {
    doc.updateCell(cells[0].unqualifiedId, { source: '6 * 2 +'})
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getStates(cells), ['broken'], 'cell should be broken')
  })
  .then(() => {
    doc.updateCell(cells[0].unqualifiedId, { source: '6 * 2 + 1'})
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getStates(cells), ['ready'], 'cell should be ready')
  })
})

test('Engine: insert rows', t => {
  t.plan(1)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4']
    ]
  })
  _play(engine)
  .then(() => {
    sheet.insertRows(1, [['5', '6'], ['7', '8']])
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(sheet.queryCells('A2:B3')), [[5, 6],[7, 8]], 'cells should have been inserted')
  })
})

test('Engine: delete rows', t => {
  t.plan(1)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8']
    ]
  })
  _play(engine)
  .then(() => {
    sheet.deleteRows(0, 2)
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(sheet.getCells()), [[5, 6],[7, 8]], 'rows should have been removed')
  })
})

test('Engine: insert cols', t => {
  t.plan(1)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      [{id:'c1',source:'1'}, {id:'c2',source:'2'}],
      [{id:'c3',source:'3'},{id:'c4',source:'4'}]
    ]
  })
  _play(engine)
  .then(() => {
    sheet.insertCols(1, [[{id:'c5',source:'5'}], [{id:'c6',source:'6'}]])
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(sheet.queryCells('A1:C2')), [[1, 5, 2],[3, 6, 4]], 'cells should have been inserted')
  })
})

test('Engine: delete cols', t => {
  t.plan(1)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
      ['9', '10', '11', '12']
    ]
  })
  _play(engine)
  .then(() => {
    sheet.deleteCols(1, 2)
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(sheet.getCells()), [[1,4],[5,8],[9,12]], 'cols should have been removed')
  })
})

test('Engine: insert and delete a row', t => {
  t.plan(1)
  let { engine } = _setup()
  let sheet = engine.addSheet({
    id: 'sheet1',
    lang: 'mini',
    cells: [
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
      ['7', '8'],
      ['9', '=sum(A1:B4)'],
    ]
  })
  _play(engine)
  .then(() => {
    sheet.insertRows(1, [['0', '0']])
  })
  .then(() => _play(engine))
  .then(() => {
    sheet.deleteRows(2, 1)
  })
  .then(() => _play(engine))
  .then(() => {
    t.deepEqual(_getValues(sheet.getCells()), [[1,2],[0,0],[5, 6],[7,8],[9,29]], 'sheet should have correct values')
  })
})

/*
  Waits for all actions to be finished.
  This is the slowest kind of scheduling, as every cycle
  takes as long as the longest evaluation.
  In a real environment, the Engine should be triggered as often as possible,
  but still with a little delay, so that all 'simultanous' actions can be
  done at once.
*/
function _cycle(engine) {
  let actions = engine.cycle()
  return Promise.all(actions)
}

/*
  Triggers a cycle as long as next actions are coming in.
*/
function _play(engine) {
  return new Promise((resolve) => {
    function step() {
      if (_needsUpdate(engine)) {
        _cycle(engine).then(step)
      } else {
        resolve()
      }
    }
    step()
  })
}

function _needsUpdate(engine) {
  const graph = engine._graph
  if (graph.needsUpdate()) return true
  const nextActions = engine._nextActions
  if (nextActions.size === 0) return false
  // update is required if there is an action that has not been suspended
  for (let [, a] of nextActions) {
    if (!a.suspended) return true
  }
  return false
}

function _checkActions(t, engine, cells, expected) {
  let nextActions = engine.getNextActions()
  let actual = []
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const action = nextActions.get(cell.id)
    actual.push(action ? action.type : undefined)
  }
  t.deepEqual(actual, expected, 'next actions should be registered correctly')
}

// TODO: there must be a helper, already
// look into other tests
function _getValue(cell) {
  if (cell.value) {
    return cell.value.data
  }
}

function _getValues(cells) {
  return cells.map(rowOrCell => {
    if (isArray(rowOrCell)) {
      return rowOrCell.map(_getValue)
    } else {
      return _getValue(rowOrCell)
    }
  })
}

function _getErrors(cells) {
  return cells.map(cell => {
    return cell.errors.map(err => {
      return err.name || 'unknown'
    })
  })
}

function _getStates(cells) {
  return cells.map(cell => {
    return cellStatusToString(cell.status)
  })
}

function _setup() {
  // A JsContext with the test function library
  let jsContext = new JsContext()
  let miniContext
  jsContext.importLibrary('test', libtest)
  // Function manager for getting function specs
  let functionManager = new FunctionManager()
  functionManager.importLibrary('test', libtestXML)
  // A mock Host that provides the JsContext when requested
  let host = {
    _disable(val) {
      this._disabled = val
    },
    createContext: function(lang) {
      if (this._disabled) {
        return Promise.resolve(new Error('No context for language '+lang))
      }
      switch (lang) {
        case 'js':
          return Promise.resolve(jsContext)
        case 'mini':
          return Promise.resolve(miniContext)
        default:
          return Promise.resolve(new Error('No context for language '+lang))
      }
    },
    functionManager
  }
  miniContext = new MiniContext(host)
  let engine = new Engine({ host })
  let graph = engine._graph
  return { host, engine, graph }
}