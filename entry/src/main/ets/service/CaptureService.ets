import fs from '@ohos.file.fs';
import image from '@ohos.multimedia.image';
import photoAccessHelper from '@ohos.file.photoAccessHelper';
import common from '@ohos.app.ability.common';
import componentSnapshot from '@ohos.arkui.componentSnapshot';
import { DailyColorManager } from '../manager/DailyColorManager';
import { PhotoDao, PhotoInfo } from '../model/PhotoDao';
import { ColorPreset } from '../model/ColorPreset';

export interface CaptureResult {
  localPath: string;
  albumSaved: boolean;
}

/**
 * 拍照落盘管线：
 * GL 滤镜帧(PixelMap) → 预览浮层(照片+水印) componentSnapshot 成图 → JPEG → 应用沙箱 → RDB 元数据。
 * 存系统相册由界面上的安全控件 SaveButton 触发（免权限临时授权）。
 */
export class CaptureService {
  /** 把沙箱内的照片文件复制进系统相册，返回相册 uri */
  static async saveToAlbum(context: common.Context, localPath: string): Promise<string | null> {
    try {
      const helper = photoAccessHelper.getPhotoAccessHelper(context);
      const uri = await helper.createAsset(photoAccessHelper.PhotoType.IMAGE, 'jpg');
      const target = await fs.open(uri, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
      const source = await fs.open(localPath, fs.OpenMode.READ_ONLY);
      await fs.copyFile(source.fd, target.fd);
      await fs.close(target.fd);
      await fs.close(source.fd);
      return uri;
    } catch (err) {
      console.error(`[TodayColor] saveToAlbum: ${JSON.stringify(err)}`);
      return null;
    }
  }

  /** 将 componentSnapshot 得到的水印合成图打包为 JPEG 并写入沙箱 */
  static async persistSnapshot(context: common.Context,
    snapshot: image.PixelMap,
    colorName: string): Promise<string | null> {
    try {
      const packer = image.createImagePacker();
      const packOpts: image.PackingOption = { format: 'image/jpeg', quality: 92 };
      const buffer: ArrayBuffer = await packer.packToData(snapshot, packOpts);
      packer.release();

      const dir = `${context.filesDir}/photos`;
      if (!fs.accessSync(dir)) {
        fs.mkdirSync(dir, true);
      }
      const now = new Date();
      const stamp = CaptureService.formatStamp(now);
      const localPath = `${dir}/today_${stamp}_${colorName}.jpg`;
      const file = fs.openSync(localPath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
      fs.writeSync(file.fd, buffer);
      fs.closeSync(file.fd);
      return localPath;
    } catch (err) {
      console.error(`[TodayColor] persist: ${JSON.stringify(err)}`);
      return null;
    }
  }

  /** 写入照片元数据表 */
  static async recordPhoto(localPath: string, albumUri: string,
    width: number, height: number, capturedColor: ColorPreset): Promise<void> {
    const info: PhotoInfo = {
      id: 0,
      uri: albumUri,
      localPath: localPath,
      dateKey: DailyColorManager.getDateKey(new Date()),
      colorName: capturedColor.name,
      colorHex: capturedColor.hex,
      width: width,
      height: height,
      createdAt: Date.now()
    };
    await PhotoDao.getInstance().insertPhoto(info);
  }

  static async deletePhoto(localPath: string, albumUri: string): Promise<void> {
    try {
      if (localPath !== '') {
        fs.unlinkSync(localPath);
      }
    } catch (err) {
      // 文件可能已不存在，忽略
    }
    if (albumUri.startsWith('file://media') || albumUri.startsWith('datashare://')) {
      try {
        // 相册侧删除需 photoAccessHelper，且仅能删本应用创建的资产
        // 演示版保留相册文件，仅清理本地记录与沙箱副本
      } catch (err) {
      }
    }
  }

  private static formatStamp(d: Date): string {
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
}
