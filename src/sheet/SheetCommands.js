import { Command } from 'substance'
import { getRange } from './sheetHelpers'

class RowsCommand extends Command {

  getCommandState(params) {
    const sel = params.selection
    if (sel && sel.isCustomSelection() && sel.customType === 'sheet') {
      let data = sel.data
      if (data.type === 'rows') {
        let startRow = Math.min(data.anchorRow, data.focusRow)
        let endRow = Math.max(data.anchorRow, data.focusRow)
        let nrows = endRow-startRow+1
        return {
          disabled: false,
          startRow, endRow, nrows
        }
      }
    }
    // otherwise
    return {
      disabled: true
    }
  }
}

class ColsCommand extends Command {

  getCommandState(params) {
    const sel = params.selection
    if (sel && sel.isCustomSelection() && sel.customType === 'sheet') {
      let data = sel.data
      if (data.type === 'columns') {
        let startCol = Math.min(data.anchorCol, data.focusCol)
        let endCol = Math.max(data.anchorCol, data.focusCol)
        let ncolumns = endCol-startCol+1
        return {
          disabled: false,
          startCol, endCol, ncolumns
        }
      }
    }
    // otherwise
    return {
      disabled: true
    }
  }

}

class ColumnMetaCommand extends Command {

  getCommandState(params) {
    const sel = params.selection
    if (sel && sel.isCustomSelection() && sel.customType === 'sheet') {
      let data = sel.data
      if (data.type === 'columns') {
        let startCol = Math.min(data.anchorCol, data.focusCol)
        let endCol = Math.max(data.anchorCol, data.focusCol)
        let ncolumns = endCol-startCol+1
        if (ncolumns === 1) {
          let colIdx = startCol
          let node = params.surface.getSheet().getColumnMeta(colIdx)
          return {
            disabled: false,
            colIdx, node
          }
        }
      }
    }
    // otherwise
    return {
      disabled: true
    }
  }

}

function insertRows({editorSession, selection, commandState}, mode) {
  //const sel = selection.data
  const refRow = mode === 'above' ?
    commandState.startRow :
    commandState.endRow + 1
  const nrows = commandState.nrows
  editorSession.transaction((tx) => {
    tx.getDocument().createRowsAt(refRow, nrows)
  })
}




function insertCols({editorSession, selection, commandState}, mode) {
  //const sel = selection.data
  const refCol = mode === 'left' ?
    commandState.startCol :
    commandState.endCol + 1
  const ncols = commandState.ncolumns
  editorSession.transaction((tx) => {
    tx.getDocument().createColumnsAt(refCol, ncols)
  })
}

function deleteRows({editorSession, commandState}) {
  editorSession.transaction((tx) => {
    tx.getDocument().deleteRows(commandState.startRow, commandState.endRow)
  })
}

function deleteColumns({editorSession, commandState}) {
  editorSession.transaction((tx) => {
    tx.getDocument().deleteColumns(commandState.startCol, commandState.endCol)
  })
}

export class InsertRowsAbove extends RowsCommand {
  execute(params) {
    insertRows(params, 'above')
  }
}

export class InsertRowsBelow extends RowsCommand {
  execute(params) {
    insertRows(params, 'below')
  }
}

export class DeleteRows extends RowsCommand {
  execute(params) {
    deleteRows(params)
  }
}

export class InsertColumnsLeft extends ColsCommand {
  execute(params) {
    insertCols(params, 'left')
  }
}

export class InsertColumnsRight extends ColsCommand {
  execute(params) {
    insertCols(params, 'right')
  }
}

export class DeleteColumns extends ColsCommand {
  execute(params) {
    deleteColumns(params)
  }
}

export class OpenColumnSettings extends ColumnMetaCommand {
  execute(params) {
    // NOTE: when the OpenColumnSettings command is active
    // params.surface is the corresponding SheetComponent
    params.surface.openColumnSettings(params)
    params.editorSession._setDirty('commandStates')
    params.editorSession.performFlow()
  }
}

export class SetLanguageCommand extends Command {

  getCommandState({ selection, editorSession }) {
    if (selection.isNull() || !(selection.isCustomSelection() && selection.customType === 'sheet')) {
      return { disabled: true }
    }
    let doc = editorSession.getDocument()
    const { anchorRow, anchorCol } = selection.data
    if(anchorRow === -1 || anchorCol === -1) {
      return { disabled: true }
    }
    let anchorCell = doc.getCell(anchorRow, anchorCol)
    let language = anchorCell.attr('language')
    let state = {
      cellId: anchorCell.id,
      newLanguage: this.config.language,
      disabled: false,
      active: this.config.language === language
    }
    return state
  }

  execute({ editorSession, commandState }) {
    let { cellId, newLanguage, disabled } = commandState
    if (!disabled) {
      editorSession.transaction((tx) => {
        let cell = tx.get(cellId)
        cell.attr({ language: newLanguage })
      })
    }
  }
}


export class SetTypeCommand extends Command {

  getCommandState({ selection, editorSession }) {
    if (selection.isNull() || !(selection.isCustomSelection() && selection.customType === 'sheet')) {
      return { disabled: true }
    }
    let labelProvider = editorSession.getConfigurator().getLabelProvider()
    let doc = editorSession.getDocument()
    let state = {
      disabled: true
    }
    let { anchorRow, anchorCol } = selection.data
    const selectionType = selection.data.type
    if(selectionType === 'columns') {
      let columnMeta = doc.getColumnMeta(anchorCol)
      let columnType = columnMeta.attr('type')
      state = {
        cellId: columnMeta.id,
        newType: this.config.type,
        columnType: labelProvider.getLabel(columnType),
        disabled: false,
        active: this.config.type === columnType
      }
    } else {
      if (selectionType === 'rows') anchorCol = 0
      let anchorCell = doc.getCell(anchorRow, anchorCol)
      let columnMeta = doc.getColumnForCell(anchorCell.id)
      let columnType = columnMeta.attr('type')
      let cellType = anchorCell.attr('type')

      state = {
        cellId: anchorCell.id,
        newType: this.config.type,
        columnType: labelProvider.getLabel(columnType),
        disabled: false,
        active: this.config.type === cellType
      }
    }
    return state
  }

  execute({ editorSession, commandState, selection }) {
    let { newType, disabled } = commandState
    const selectionType = selection.data.type
    if (!disabled) {
      if(selectionType === 'range' || selectionType === 'rows') {
        const range = getRange(editorSession)
        editorSession.transaction((tx) => {
          tx.getDocument().setTypeForRange(range.startRow, range.startCol, range.endRow, range.endCol, newType)
        })
      } else if (selectionType === 'columns') {
        const range = getRange(editorSession)
        editorSession.transaction((tx) => {
          for (let colIdx = range.startCol; colIdx <= range.endCol; colIdx++) {
            let cell = tx.getDocument().getColumnMeta(colIdx)
            cell.attr({type: newType})
          }
        })
      }
    }
  }
}


export class EditCellExpressionCommand extends Command {

  getCommandState({ selection, editorSession }) {
    if (selection.isNull() || !(selection.isCustomSelection() && selection.customType === 'sheet')) {
      return { disabled: true }
    }
    const doc = editorSession.getDocument()
    const { anchorRow, anchorCol } = selection.data
    if(anchorRow === -1 || anchorCol === -1) {
      return { disabled: true }
    }
    const editor = editorSession.getEditor()
    const mode = editor.refs.sheet.getMode()
    if(mode === 'minimum') {
      return { disabled: true }
    }
    let anchorCell = doc.getCell(anchorRow, anchorCol)
    let state = {
      cellId: anchorCell.id,
      disabled: false
    }
    return state
  }

  execute() {
    // no execute
  }

}

export class ChangeModeCommand extends Command {
  getCommandState(params) {
    const editor = params.editorSession.getEditor()
    if(editor) {
      const surface = editor.refs.sheet
      if(surface) {
        const mode = surface.state.mode
        return {
          newMode: this.config.mode,
          disabled: false,
          active: this.config.mode === mode
        }
      }
    }

    return {
      // TODO: we should get default value from outside
      active: this.config.mode === 'normal',
      disabled: false
    }
  }

  execute(params) {
    const editor = params.editorSession.getEditor()
    let surface = editor.refs.sheet
    surface.extendState({mode: this.config.mode})
    params.editorSession._setDirty('commandStates')
    params.editorSession.performFlow()
  }
}
