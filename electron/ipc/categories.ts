import { ipcMain } from 'electron'
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryRow,
  type CategoryInput
} from '../db/categoryRepo'

export function registerCategoryHandlers(): void {
  ipcMain.handle('categories:getAll', () => {
    return getAllCategories()
  })

  ipcMain.handle('categories:create', (_event, input: CategoryInput) => {
    return createCategory(input)
  })

  ipcMain.handle('categories:update', (_event, cat: CategoryRow) => {
    return updateCategory(cat)
  })

  ipcMain.handle('categories:delete', (_event, id: number) => {
    deleteCategory(id)
  })
}
