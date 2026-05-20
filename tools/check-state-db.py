import sqlite3
import sys

db_path = r'C:\Users\ohfen\AppData\Local\hermes\state.db'
db = sqlite3.connect(db_path)

# 列出所有表
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print('=== Tables ===')
for t in tables:
    print(t[0])

# 查看 sessions 表结构
print('\n=== sessions 表结构 ===')
try:
    cols = db.execute('PRAGMA table_info(sessions)').fetchall()
    for c in cols:
        print(f'  {c[1]} ({c[2]})')
except:
    print('  无 sessions 表')

# 查看所有 session 记录
print('\n=== 所有 session (最近20条) ===')
try:
    rows = db.execute('SELECT * FROM sessions ORDER BY rowid DESC LIMIT 20').fetchall()
    for r in rows:
        # 截断过长的内容
        truncated = []
        for v in r:
            s = str(v)
            if len(s) > 200:
                s = s[:200] + '...'
            truncated.append(s)
        print(' | '.join(truncated))
except Exception as e:
    print(f'  错误: {e}')

# 查看 messages 表结构
print('\n=== messages 表结构 ===')
try:
    cols = db.execute('PRAGMA table_info(messages)').fetchall()
    for c in cols:
        print(f'  {c[1]} ({c[2]})')
except:
    print('  无 messages 表')

# 查看有多少个不同的 session_id
print('\n=== 不同的 session_id 数量 ===')
try:
    row = db.execute('SELECT COUNT(DISTINCT session_id) FROM messages').fetchone()
    print(f'  {row[0]} 个不同的 session_id')
except Exception as e:
    print(f'  错误: {e}')

# 列出所有 session_id
print('\n=== 所有 session_id ===')
try:
    rows = db.execute('SELECT DISTINCT session_id FROM messages').fetchall()
    for r in rows:
        print(f'  {r[0]}')
except Exception as e:
    print(f'  错误: {e}')

# 查看每个 session 的消息数量
print('\n=== 每个 session 的消息数量 ===')
try:
    rows = db.execute('SELECT session_id, COUNT(*) as cnt FROM messages GROUP BY session_id ORDER BY cnt DESC').fetchall()
    for r in rows:
        sid = str(r[0])[:80]
        print(f'  {sid}: {r[1]} 条消息')
except Exception as e:
    print(f'  错误: {e}')

db.close()
