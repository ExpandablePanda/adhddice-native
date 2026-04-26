import { STATUSES, mapSubtasks } from '../../../lib/TasksContext';

export const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

export const newSubtask = title => ({ 
  id: generateId(), 
  title, 
  status: 'pending', 
  subtasks: [] 
});

export const BLANK = () => ({ 
  id: null, 
  title: '', 
  status: 'pending', 
  energy: null, 
  dueDate: '', 
  tags: [], 
  subtasks: [], 
  streak: 0, 
  isPriority: false, 
  isUrgent: false, 
  isImportant: false, 
  statusHistory: {}, 
  frequencyDays: null, 
  estimatedMinutes: null, 
  weeklyDay: null, 
  weeklyMode: null, 
  link: '', 
  linkTitle: '' 
});

export function toggleById(subtasks, id, targetStatus) {
  return mapSubtasks(subtasks, s => {
    if (s.id !== id) return s;
    if (targetStatus) {
      const isDone = targetStatus === 'done' || targetStatus === 'did_my_best';
      return { ...s, done: isDone, status: targetStatus };
    }
    const nowDone = !s.done;
    return { ...s, done: nowDone, status: nowDone ? 'done' : 'pending' };
  });
}

export function deleteById(subtasks, id) {
  return subtasks
    .filter(s => s.id !== id)
    .map(s => ({ ...s, subtasks: deleteById(s.subtasks || [], id) }));
}

export function addChildTo(subtasks, parentId, child) {
  return mapSubtasks(subtasks, s =>
    s.id === parentId ? { ...s, subtasks: [...(s.subtasks || []), child] } : s
  );
}

export function countSubtasks(subtasks) {
  if (!subtasks) return 0;
  return subtasks.reduce((acc, s) => acc + 1 + countSubtasks(s.subtasks || []), 0);
}

export function countDone(subtasks) {
  if (!subtasks) return 0;
  return subtasks.reduce((acc, s) => acc + ((s.status === 'done' || s.status === 'did_my_best') ? 1 : 0) + countDone(s.subtasks || []), 0);
}

export function cycleStatusInTree(subtasks, id) {
  return mapSubtasks(subtasks, s => {
    if (s.id === id) {
      const nextKey = STATUSES[s.status || 'pending'].next;
      return { ...s, status: nextKey, done: nextKey === 'done' || nextKey === 'did_my_best' };
    }
    return s;
  });
}

export function updateStatusInTree(subtasks, id, status) {
  return mapSubtasks(subtasks || [], s =>
    s.id === id ? { ...s, status, done: status === 'done' || status === 'did_my_best' } : s
  );
}

export function findInTree(subtasks, id) {
  for (const s of subtasks) {
    if (s.id === id) return s;
    const found = findInTree(s.subtasks || [], id);
    if (found) return found;
  }
  return null;
}

export function reorderInTree(subtasks, id, direction) {
  const idx = subtasks.findIndex(s => s.id === id);
  if (idx !== -1) {
    const nextArr = [...subtasks];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < nextArr.length) {
      [nextArr[idx], nextArr[targetIdx]] = [nextArr[targetIdx], nextArr[idx]];
    }
    return nextArr;
  }
  return subtasks.map(s => ({
    ...s,
    subtasks: reorderInTree(s.subtasks || [], id, direction)
  }));
}

export function ensureUniqueIds(tasks) {
  const seen = new Set();
  let changed = false;

  function processSubtasks(subs) {
    return (subs || []).map(s => {
      let finalId = s.id;
      if (!finalId || seen.has(finalId)) {
        finalId = generateId();
        changed = true;
      }
      seen.add(finalId);
      return {
        ...s,
        id: finalId,
        subtasks: processSubtasks(s.subtasks)
      };
    });
  }

  const result = tasks.map(t => {
    let finalId = t.id;
    if (!finalId || seen.has(finalId)) {
      finalId = generateId();
      changed = true;
    }
    seen.add(finalId);
    return {
      ...t,
      id: finalId,
      subtasks: processSubtasks(t.subtasks)
    };
  });

  return { result, changed };
}

export function getStepPresets(title = '') {
  const t = title.toLowerCase();
  const presets = {
    read:     ['Open book to page', 'Set 10m timer', 'Find bookmark', 'Clear space'],
    write:    ['Open document', 'Title the file', 'Draft 1 sentence', 'Outlining'],
    clean:    ['Pick up 3 items', 'Put on music', 'Grab trash bag', 'Set 5m timer'],
    call:     ['Find phone number', 'Set phone on desk', 'Script first sentence'],
    code:     ['Open IDE', 'Read task ticket', 'Write 1 test', 'Branch check'],
    study:    ['Open notes', 'Clear desk', 'Focus music on', 'Review 1 slide'],
    buy:      ['Check inventory', 'Find store hours', 'Grab reusable bag'],
    email:    ['Draft subject line', 'Find recipient address', 'Write greeting'],
    workout:  ['Put on shoes', 'Roll out mat', 'Fill water bottle', 'Choose playlist'],
    generic:  ['Deep breath', 'Prep workspace', 'Set 5m timer', 'Clear 1 item']
  };

  if (t.includes('read'))   return presets.read;
  if (t.includes('write'))  return presets.write;
  if (t.includes('clean'))  return presets.clean;
  if (t.includes('call'))   return presets.call;
  if (t.includes('code'))   return presets.code;
  if (t.includes('study'))  return presets.study;
  if (t.includes('buy'))    return presets.buy;
  if (t.includes('email'))  return presets.email;
  if (t.includes('workou')) return presets.workout;
  return presets.generic;
}

export function flattenToSteps(tasks) {
  let steps = [];
  tasks.forEach(t => {
    const undoneSubtasks = (t.subtasks || []).filter(s => s.status !== 'done' && s.status !== 'did_my_best');
    if (undoneSubtasks.length > 0) {
      undoneSubtasks.forEach(s => {
        steps.push({ ...s, parentId: t.id, parentTitle: t.title, isSubtask: true });
      });
    } else if (t.status !== 'done' && t.status !== 'did_my_best') {
      steps.push({ ...t, parentId: null, parentTitle: null, isSubtask: false });
    }
  });
  return steps;
}
