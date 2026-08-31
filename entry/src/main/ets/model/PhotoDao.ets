import relationalStore from '@ohos.data.relationalStore';
import common from '@ohos.app.ability.common';

/** 照片元数据（RDB 表 photos 的一行） */
export interface PhotoInfo {
  id: number;         // 自增主键
  uri: string;        // 系统相册中的 photoAccessHelper uri（分享、跳系统相册用）
  localPath: string;  // 应用沙箱内副本路径（相册页/缩略图展示用，免媒体读权限）
  dateKey: string;    // 拍摄日期键 YYYYMMDD，“今日相册”按此查询
  colorName: string;  // 拍摄当日的颜色名（如“克莱因蓝”）
  colorHex: string;   // 拍摄当日的颜色 HEX（相册页色卡复现）
  width: number;
  height: number;
  createdAt: number;  // 拍摄时间戳（毫秒）
}

const TABLE_PHOTOS = 'photos';

const COLUMNS: string[] = [
  'id', 'uri', 'local_path', 'date_key', 'color_name', 'color_hex', 'width', 'height', 'created_at'
];

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ${TABLE_PHOTOS} (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  uri         TEXT NOT NULL,
  local_path  TEXT NOT NULL,
  date_key    TEXT NOT NULL,
  color_name  TEXT NOT NULL,
  color_hex   TEXT NOT NULL,
  width       INTEGER DEFAULT 0,
  height      INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
)`;

const CREATE_DAY_COLORS_SQL = `CREATE TABLE IF NOT EXISTS day_colors (
  date_key    TEXT PRIMARY KEY,
  hex         TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
)`;

const CREATE_UNLOCKS_SQL = `CREATE TABLE IF NOT EXISTS color_unlocks (
  name            TEXT PRIMARY KEY,
  hex             TEXT NOT NULL,
  first_date_key  TEXT NOT NULL,
  count           INTEGER DEFAULT 1,
  updated_at      INTEGER NOT NULL
)`;

/**
 * 照片元数据 DAO（RelationalStore）
 * 只存“元数据”；图像本体在系统相册（由 photoAccessHelper 管理）+ 应用沙箱副本。
 * 索引建议：date_key 为最高频查询条件，建表后追加一次索引创建（见 init）。
 */
export class PhotoDao {
  private static instance: PhotoDao | null = null;
  private store: relationalStore.RdbStore | null = null;

  static getInstance(): PhotoDao {
    if (PhotoDao.instance === null) {
      PhotoDao.instance = new PhotoDao();
    }
    return PhotoDao.instance;
  }

  /** 幂等初始化：建库建表建索引 */
  async init(context: common.Context): Promise<void> {
    if (this.store !== null) {
      return;
    }
    const config: relationalStore.StoreConfig = {
      name: 'today_color.db',
      securityLevel: relationalStore.SecurityLevel.S1
    };
    this.store = await relationalStore.getRdbStore(context, config);
    await this.store.executeSql(CREATE_TABLE_SQL);
    await this.store.executeSql(CREATE_DAY_COLORS_SQL);
    await this.store.executeSql(CREATE_UNLOCKS_SQL);
    await this.store.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_photos_date ON ${TABLE_PHOTOS} (date_key)`);
  }

  /** 保存/更新某天的主色（岁月色卡缓存） */
  async saveDayColor(dateKey: string, hex: string): Promise<void> {
    if (this.store === null) {
      return;
    }
    await this.store.executeSql(
      'INSERT OR REPLACE INTO day_colors (date_key, hex, updated_at) VALUES (?, ?, ?)',
      [dateKey, hex, Date.now()]);
  }

  /** 区间内的已缓存日主色 */
  async queryDayColors(startKey: string, endKey: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (this.store === null) {
      return map;
    }
    const predicates = new relationalStore.RdbPredicates('day_colors');
    predicates.between('date_key', startKey, endKey);
    const resultSet = await this.store.query(predicates, ['date_key', 'hex']);
    try {
      while (resultSet.goToNextRow()) {
        map.set(resultSet.getString(resultSet.getColumnIndex('date_key')),
          resultSet.getString(resultSet.getColumnIndex('hex')));
      }
    } finally {
      resultSet.close();
    }
    return map;
  }

  /** 区间内的全部照片（按时间升序），供按天分组提取主色 */
  async queryPhotosBetween(startKey: string, endKey: string): Promise<PhotoInfo[]> {
    if (this.store === null) {
      return [];
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.between('date_key', startKey, endKey).orderByAsc('created_at');
    const resultSet = await this.store.query(predicates, COLUMNS);
    const list: PhotoInfo[] = [];
    try {
      while (resultSet.goToNextRow()) {
        list.push(this.rowToPhoto(resultSet));
      }
    } finally {
      resultSet.close();
    }
    return list;
  }

  /** 插入一条照片元数据，返回行 id（-1 表示库未初始化） */
  async insertPhoto(photo: PhotoInfo): Promise<number> {
    if (this.store === null) {
      return -1;
    }
    const bucket: relationalStore.ValuesBucket = {
      'uri': photo.uri,
      'local_path': photo.localPath,
      'date_key': photo.dateKey,
      'color_name': photo.colorName,
      'color_hex': photo.colorHex,
      'width': photo.width,
      'height': photo.height,
      'created_at': photo.createdAt
    };
    return this.store.insert(TABLE_PHOTOS, bucket);
  }

  /** 某一天的全部照片，按拍摄时间倒序（今日相册页数据源） */
  async queryByDate(dateKey: string): Promise<PhotoInfo[]> {
    if (this.store === null) {
      return [];
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.equalTo('date_key', dateKey).orderByDesc('created_at');
    const resultSet = await this.store.query(predicates, COLUMNS);
    const list: PhotoInfo[] = [];
    try {
      while (resultSet.goToNextRow()) {
        list.push(this.rowToPhoto(resultSet));
      }
    } finally {
      resultSet.close();
    }
    return list;
  }

  /** 某一天的最后一张（取景页左下角缩略图入口） */
  async queryLatestByDate(dateKey: string): Promise<PhotoInfo | null> {
    if (this.store === null) {
      return null;
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.equalTo('date_key', dateKey).orderByDesc('created_at').limitAs(1);
    const resultSet = await this.store.query(predicates, COLUMNS);
    let photo: PhotoInfo | null = null;
    try {
      if (resultSet.goToNextRow()) {
        photo = this.rowToPhoto(resultSet);
      }
    } finally {
      resultSet.close();
    }
    return photo;
  }

  /** 某一天的拍摄数量（顶部轻量统计） */
  async countByDate(dateKey: string): Promise<number> {
    if (this.store === null) {
      return 0;
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.equalTo('date_key', dateKey);
    const resultSet = await this.store.query(predicates, ['id']);
    const count = resultSet.rowCount;
    resultSet.close();
    return count;
  }

  /** 删除元数据（相册内图像文件的清理由 photoAccessHelper 侧配合完成，Step 3 处理） */
  async deleteById(id: number): Promise<boolean> {
    if (this.store === null) {
      return false;
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.equalTo('id', id);
    const affectedRows = await this.store.delete(predicates);
    return affectedRows > 0;
  }

  /** 图鉴解锁状态 */
  async unlockColor(name: string, hex: string, dateKey: string): Promise<void> {
    if (this.store === null) {
      return;
    }
    await this.store.executeSql(
      'INSERT OR REPLACE INTO color_unlocks (name, hex, first_date_key, count, updated_at) VALUES (?, ?, ?, 1, ?)',
      [name, hex, dateKey, Date.now()]);
  }

  async increaseColorUnlock(name: string): Promise<void> {
    if (this.store === null) {
      return;
    }
    await this.store.executeSql(
      'UPDATE color_unlocks SET count = count + 1, updated_at = ? WHERE name = ?',
      [Date.now(), name]);
  }

  /** 已解锁传统色 → 相遇次数 */
  async queryColorUnlockCounts(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (this.store === null) {
      return map;
    }
    const predicates = new relationalStore.RdbPredicates('color_unlocks');
    const resultSet = await this.store.query(predicates, ['name', 'count']);
    try {
      while (resultSet.goToNextRow()) {
        map.set(resultSet.getString(resultSet.getColumnIndex('name')),
          resultSet.getLong(resultSet.getColumnIndex('count')));
      }
    } finally {
      resultSet.close();
    }
    return map;
  }

  /** 单个传统色的解锁记录（null=未解锁） */
  async getColorUnlock(name: string): Promise<boolean | null> {
    if (this.store === null) {
      return null;
    }
    const predicates = new relationalStore.RdbPredicates('color_unlocks');
    predicates.equalTo('name', name);
    const resultSet = await this.store.query(predicates, ['name']);
    let found: boolean | null = null;
    try {
      if (resultSet.goToNextRow()) {
        found = true;
      }
    } finally {
      resultSet.close();
    }
    return found;
  }

  /** ===== 时空回声统计 ===== */

  /** 某天的照片数 */
  async countPhotosOn(dateKey: string): Promise<number> {
    if (this.store === null) {
      return 0;
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.equalTo('date_key', dateKey);
    const resultSet = await this.store.query(predicates, ['id']);
    const count = resultSet.rowCount;
    resultSet.close();
    return count;
  }

  /** 某天第一张照片的颜色名（去年的今天回声用） */
  async firstColorNameOn(dateKey: string): Promise<string | null> {
    if (this.store === null) {
      return null;
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.equalTo('date_key', dateKey).orderByAsc('created_at').limitAs(1);
    const resultSet = await this.store.query(predicates, ['color_name']);
    let name: string | null = null;
    try {
      if (resultSet.goToNextRow()) {
        name = resultSet.getString(resultSet.getColumnIndex('color_name'));
      }
    } finally {
      resultSet.close();
    }
    return name;
  }

  /** 今年遇见某色的次数 */
  async countPhotosByColorNameYear(colorName: string, yearPrefix: string): Promise<number> {
    if (this.store === null) {
      return 0;
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    predicates.equalTo('color_name', colorName)
      .beginsWith('date_key', yearPrefix);
    const resultSet = await this.store.query(predicates, ['id']);
    const count = resultSet.rowCount;
    resultSet.close();
    return count;
  }

  /** 用颜色记录生活的天数（去重日期） */
  async countDistinctDays(): Promise<number> {
    if (this.store === null) {
      return 0;
    }
    const resultSet = await this.store.querySql(
      'SELECT COUNT(DISTINCT date_key) AS cnt FROM photos');
    let count = 0;
    try {
      if (resultSet.goToFirstRow()) {
        count = resultSet.getLong(resultSet.getColumnIndex('cnt'));
      }
    } finally {
      resultSet.close();
    }
    return count;
  }

  /** 累计照片数 */
  async countAll(): Promise<number> {
    if (this.store === null) {
      return 0;
    }
    const predicates = new relationalStore.RdbPredicates(TABLE_PHOTOS);
    const resultSet = await this.store.query(predicates, ['id']);
    const count = resultSet.rowCount;
    resultSet.close();
    return count;
  }

  private rowToPhoto(rs: relationalStore.ResultSet): PhotoInfo {
    const photo: PhotoInfo = {
      id: rs.getLong(rs.getColumnIndex('id')),
      uri: rs.getString(rs.getColumnIndex('uri')),
      localPath: rs.getString(rs.getColumnIndex('local_path')),
      dateKey: rs.getString(rs.getColumnIndex('date_key')),
      colorName: rs.getString(rs.getColumnIndex('color_name')),
      colorHex: rs.getString(rs.getColumnIndex('color_hex')),
      width: rs.getLong(rs.getColumnIndex('width')),
      height: rs.getLong(rs.getColumnIndex('height')),
      createdAt: rs.getLong(rs.getColumnIndex('created_at'))
    };
    return photo;
  }
}
