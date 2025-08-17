import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const extensionName = 'vertin-tips';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 默认设置
const defaultSettings = {
    enabled: true,
    modules: {
        autoBackup: {
            enabled: false
        }
    }
};

// 模块系统
const moduleManager = {
    modules: new Map(),
    loadedModules: new Set(),
    
    /**
     * 注册模块
     * @param {string} name 模块名称
     * @param {object} moduleDefinition 模块定义
     */
    register(name, moduleDefinition) {
        if (this.modules.has(name)) {
            console.warn(`[${extensionName}] 模块 ${name} 已存在，将被覆盖`);
        }
        
        this.modules.set(name, {
            name,
            enabled: false,
            ...moduleDefinition
        });
        
        console.log(`[${extensionName}] 模块 ${name} 已注册`);
    },
    
    /**
     * 加载模块
     * @param {string} name 模块名称
     */
    async load(name) {
        const module = this.modules.get(name);
        if (!module) {
            console.error(`[${extensionName}] 模块 ${name} 未找到`);
            return false;
        }
        
        if (this.loadedModules.has(name)) {
            console.log(`[${extensionName}] 模块 ${name} 已加载`);
            return true;
        }
        
        try {
            if (module.init && typeof module.init === 'function') {
                await module.init();
            }
            
            this.loadedModules.add(name);
            module.enabled = true;
            console.log(`[${extensionName}] 模块 ${name} 加载成功`);
            return true;
        } catch (error) {
            console.error(`[${extensionName}] 模块 ${name} 加载失败:`, error);
            return false;
        }
    },
    
    /**
     * 卸载模块
     * @param {string} name 模块名称
     */
    async unload(name) {
        const module = this.modules.get(name);
        if (!module) {
            console.error(`[${extensionName}] 模块 ${name} 未找到`);
            return false;
        }
        
        if (!this.loadedModules.has(name)) {
            console.log(`[${extensionName}] 模块 ${name} 未加载`);
            return true;
        }
        
        try {
            if (module.destroy && typeof module.destroy === 'function') {
                await module.destroy();
            }
            
            this.loadedModules.delete(name);
            module.enabled = false;
            console.log(`[${extensionName}] 模块 ${name} 卸载成功`);
            return true;
        } catch (error) {
            console.error(`[${extensionName}] 模块 ${name} 卸载失败:`, error);
            return false;
        }
    },
    
    /**
     * 获取所有已注册的模块
     */
    getModules() {
        return Array.from(this.modules.values());
    },
    
    /**
     * 检查模块是否已加载
     * @param {string} name 模块名称
     */
    isLoaded(name) {
        return this.loadedModules.has(name);
    }
};

// 自动备份模块
const autoBackupModule = {
    name: 'autoBackup',
    displayName: '自动备份',
    description: '自动备份SillyTavern数据文件夹',
    version: '1.0.0',
    
    // 备份配置
    config: {
        interval: 60, // 默认60分钟
        backupPath: '', // 备份路径，空为默认桌面
        maxBackups: 10, // 最大备份文件数
        enabled: false
    },
    
    // 定时器
    backupTimer: null,
    
    // 模块初始化
    async init() {
        console.log(`[${extensionName}] 自动备份模块初始化中...`);
        
        // 加载配置
        this.loadConfig();
        
        // 如果启用了自动备份，启动定时器
        if (this.config.enabled) {
            this.startAutoBackup();
        }
        
        console.log(`[${extensionName}] 自动备份模块初始化完成`);
    },
    
    // 模块销毁
    async destroy() {
        console.log(`[${extensionName}] 自动备份模块销毁中...`);
        
        // 停止定时器
        this.stopAutoBackup();
        
        console.log(`[${extensionName}] 自动备份模块销毁完成`);
    },
    
    // 加载配置
    loadConfig() {
        const settings = extension_settings[extensionName];
        if (settings.modules?.autoBackup?.config) {
            this.config = { ...this.config, ...settings.modules.autoBackup.config };
        }
    },
    
    // 保存配置
    saveConfig() {
        const settings = extension_settings[extensionName];
        if (!settings.modules) settings.modules = {};
        if (!settings.modules.autoBackup) settings.modules.autoBackup = { enabled: false };
        settings.modules.autoBackup.config = this.config;
        saveSettingsDebounced();
    },
    
    // 启动自动备份
    startAutoBackup() {
        this.stopAutoBackup(); // 先停止之前的定时器
        
        if (this.config.interval > 0) {
            const intervalMs = this.config.interval * 60 * 1000; // 转换为毫秒
            this.backupTimer = setInterval(() => {
                this.createBackup({ mode: 'auto' });
            }, intervalMs);
            
            console.log(`[${extensionName}] 自动备份已启动，间隔: ${this.config.interval}分钟`);
        }
    },
    
    // 停止自动备份
    stopAutoBackup() {
        if (this.backupTimer) {
            clearInterval(this.backupTimer);
            this.backupTimer = null;
            console.log(`[${extensionName}] 自动备份已停止`);
        }
    },
    
    async createBackup(options = {}) {
        const { mode = 'manual' } = options; // 'manual' or 'auto'

        try {
            console.log(`[${extensionName}] 开始创建备份 (模式: ${mode})...`);

            // 自动备份总是使用下载方式
            if (mode === 'auto') {
                return await this.downloadBackup();
            }

            // 手动备份：优先尝试本地备份，如果失败则回退到下载
            const backupPath = this.getBackupPath();

            // 如果没有设置备份路径或在浏览器中，则直接下载
            if (!backupPath || typeof require === 'undefined') {
                console.log(`[${extensionName}] 未配置本地路径或在浏览器环境，回退到下载方式`);
                return await this.downloadBackup();
            }

            // 执行本地备份
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const backupFileName = `sillytavern-data-backup-${timestamp}.zip`;
            const result = await this.performLocalBackup(backupPath, backupFileName);

            if (result.success) {
                console.log(`[${extensionName}] 本地备份成功: ${result.filePath}`);
                await this.cleanupOldBackups();
                this.showNotification('备份成功', `备份已保存到: ${result.filePath}`, 'success');
                return result;
            } else {
                console.warn(`[${extensionName}] 本地备份失败，尝试下载方式:`, result.error);
                this.showNotification('本地备份失败', '将尝试使用下载方式进行备份', 'warning');
                return await this.downloadBackup();
            }
        } catch (error) {
            console.error(`[${extensionName}] 备份失败:`, error);
            this.showNotification('备份失败', error.message, 'error');
            return { success: false, error: error.message };
        }
    },
    
    // 获取备份路径
    getBackupPath() {
        if (this.config.backupPath) {
            return this.config.backupPath;
        }

        // 在浏览器或无法访问文件系统的环境中，我们无法确定默认路径。
        // 返回空字符串将使备份逻辑回退到下载。
        if (typeof require === 'undefined') {
            return '';
        }

        try {
            // 对于Node.js/Electron，提供一个合理的默认值。
            const path = require('path');
            const os = require('os');
            return path.join(os.homedir(), 'Desktop', 'SillyTavern-Backups');
        } catch (e) {
            console.error(`[${extensionName}] 无法确定默认备份路径:`, e);
            // 如果os/path模块因某种原因失败，则回退。
            return './backups';
        }
    },
    
    // 执行本地备份 (Node.js/Electron环境)
    async performLocalBackup(backupPath, fileName) {
        if (typeof require === 'undefined') {
            return { success: false, error: '当前环境不支持本地文件系统访问' };
        }

        try {
            const fs = require('fs').promises;
            const fullPath = require('path').join(backupPath, fileName);

            // 确保备份目录存在
            await fs.mkdir(backupPath, { recursive: true });

            // 压缩data文件夹
            await this.zipDirectory('./data', fullPath);

            const stats = await fs.stat(fullPath);
            return { success: true, filePath: fullPath, size: stats.size };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // 执行下载备份
    async downloadBackup() {
        console.log(`[${extensionName}] 正在准备下载备份...`);
        try {
            // 此处应调用SillyTavern的API来触发下载
            // 假设有一个全局函数`getBackup()`可以触发下载
            if (window.getBackup && typeof window.getBackup === 'function') {
                window.getBackup();
                this.showNotification('备份已开始', '您的浏览器将开始下载备份文件。', 'success');
                return { success: true, method: 'download' };
            } else {
                throw new Error('未找到SillyTavern的备份功能 (getBackup)');
            }
        } catch (error) {
            return { success: false, error: error.message, method: 'download' };
        }
    },
    
    // 浏览器环境下的备份处理（现在由createBackup决定是否调用）
    async browserBackup() {
       return await this.downloadBackup();
    },
    
    // 压缩目录
    async zipDirectory(sourceDir, targetFile) {
        return new Promise((resolve, reject) => {
            if (typeof require === 'undefined') {
                reject(new Error('require不可用，无法压缩文件'));
                return;
            }
            
            const fs = require('fs');
            const archiver = require('archiver');
            
            const output = fs.createWriteStream(targetFile);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', () => {
                resolve();
            });
            
            archive.on('error', (err) => {
                reject(err);
            });
            
            archive.pipe(output);
            archive.directory(sourceDir, false);
            archive.finalize();
        });
    },
    
    // 清理旧备份
    async cleanupOldBackups() {
        try {
            const backupPath = this.getBackupPath();
            
            if (typeof require !== 'undefined') {
                const fs = require('fs').promises;
                const path = require('path');
                
                const files = await fs.readdir(backupPath);
                const backupFiles = files
                    .filter(file => file.startsWith('sillytavern-data-backup-') && file.endsWith('.zip'))
                    .map(file => ({
                        name: file,
                        path: path.join(backupPath, file),
                        stat: null
                    }));
                
                // 获取文件统计信息
                for (const file of backupFiles) {
                    try {
                        file.stat = await fs.stat(file.path);
                    } catch (err) {
                        console.warn(`[${extensionName}] 无法获取文件统计信息: ${file.name}`);
                    }
                }
                
                // 按修改时间排序，新的在前
                backupFiles.sort((a, b) => {
                    if (!a.stat || !b.stat) return 0;
                    return b.stat.mtime.getTime() - a.stat.mtime.getTime();
                });
                
                // 删除超出数量限制的备份
                if (backupFiles.length > this.config.maxBackups) {
                    const filesToDelete = backupFiles.slice(this.config.maxBackups);
                    for (const file of filesToDelete) {
                        try {
                            await fs.unlink(file.path);
                            console.log(`[${extensionName}] 已删除旧备份: ${file.name}`);
                        } catch (err) {
                            console.warn(`[${extensionName}] 删除备份失败: ${file.name}`, err);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`[${extensionName}] 清理旧备份失败:`, error);
        }
    },
    
    // 获取备份列表
    async getBackupList() {
        try {
            const backupPath = this.getBackupPath();
            
            if (typeof require !== 'undefined') {
                const fs = require('fs').promises;
                const path = require('path');
                
                const files = await fs.readdir(backupPath);
                const backupFiles = [];
                
                for (const file of files) {
                    if (file.startsWith('sillytavern-data-backup-') && file.endsWith('.zip')) {
                        try {
                            const filePath = path.join(backupPath, file);
                            const stat = await fs.stat(filePath);
                            backupFiles.push({
                                name: file,
                                path: filePath,
                                size: stat.size,
                                created: stat.mtime
                            });
                        } catch (err) {
                            console.warn(`[${extensionName}] 无法获取备份文件信息: ${file}`);
                        }
                    }
                }
                
                // 按创建时间排序，新的在前
                backupFiles.sort((a, b) => b.created.getTime() - a.created.getTime());
                return backupFiles;
            }
            
            return [];
        } catch (error) {
            console.warn(`[${extensionName}] 获取备份列表失败:`, error);
            return [];
        }
    },
    
    // 显示通知
    showNotification(title, message, type = 'info') {
        // 尝试使用SillyTavern的通知系统
        if (typeof toastr !== 'undefined') {
            switch (type) {
                case 'success':
                    toastr.success(message, title);
                    break;
                case 'error':
                    toastr.error(message, title);
                    break;
                case 'warning':
                    toastr.warning(message, title);
                    break;
                default:
                    toastr.info(message, title);
            }
        } else {
            // 回退到浏览器通知
            console.log(`[${extensionName}] ${title}: ${message}`);
        }
    },
    
    // 手动备份
    async manualBackup() {
        return await this.createBackup({ mode: 'manual' });
    },
    
    // 设置备份间隔
    setInterval(minutes) {
        this.config.interval = Math.max(1, parseInt(minutes) || 60);
        this.saveConfig();
        
        if (this.config.enabled) {
            this.startAutoBackup();
        }
    },
    
    // 设置备份路径
    setBackupPath(path) {
        this.config.backupPath = path || '';
        this.saveConfig();
    },
    
    // 设置最大备份数
    setMaxBackups(count) {
        this.config.maxBackups = Math.max(1, parseInt(count) || 10);
        this.saveConfig();
    },
    
    // 启用/禁用自动备份
    setEnabled(enabled) {
        this.config.enabled = !!enabled;
        this.saveConfig();
        
        if (enabled) {
            this.startAutoBackup();
        } else {
            this.stopAutoBackup();
        }
    }
};

// 初始化扩展
jQuery(async () => {
    // 加载设置
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }
    
    // 注册模块
    moduleManager.register('autoBackup', autoBackupModule);
    
    // 根据设置加载模块
    const settings = extension_settings[extensionName];
    if (settings.modules?.autoBackup?.enabled) {
        await moduleManager.load('autoBackup');
    }
    
    // 添加设置界面
    addSettingsUI();
    
    console.log(`[${extensionName}] 模块化QOL插件已加载`);
    console.log(`[${extensionName}] 已注册模块:`, moduleManager.getModules().map(m => m.name).join(', '));
});

// 添加设置界面
function addSettingsUI() {
    const settingsHtml = `
    <div id="vertin-tips-settings">
        <div class="inline-drawer">
            <div id="vertin-tips-header" class="inline-drawer-toggle inline-drawer-header">
                <b>KKTsN的QOL工具包</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div id="vertin-tips-content" class="inline-drawer-content" style="display: none;">
                <div style="padding: 10px;">
                    <div style="margin-bottom: 10px;">
                        <label class="checkbox_label">
                            <input id="vertin-tips-enabled" type="checkbox" />
                            <span>启用QOL工具包</span>
                        </label>
                    </div>
                    
                    <div style="margin-bottom: 15px; padding: 10px; background: #f0f0f0; border-radius: 5px;">
                        <h4 style="margin: 0 0 10px 0;">模块管理</h4>
                        <div id="vertin-tips-modules-list">
                            <!-- 模块列表将在这里动态生成 -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    
    // 添加到扩展设置面板
    $('#extensions_settings').append(settingsHtml);
    
    // 绑定设置控件
    bindSettingsControls();
    
    // 更新模块列表
    updateModulesList();
}

// 绑定设置控件
function bindSettingsControls() {
    const settings = extension_settings[extensionName];
    
    // 启用/禁用开关
    $('#vertin-tips-enabled')
        .prop('checked', settings.enabled)
        .on('change', function() {
            settings.enabled = $(this).prop('checked');
            saveSettingsDebounced();
        });
    
    // 折叠面板功能
    $('#vertin-tips-header').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const content = $('#vertin-tips-content');
        const icon = $(this).find('.inline-drawer-icon');
        
        if (content.is(':visible')) {
            content.slideUp(200);
            icon.removeClass('up').addClass('down');
        } else {
            content.slideDown(200);
            icon.removeClass('down').addClass('up');
        }
    });
}

// 更新模块列表
function updateModulesList() {
    const modulesList = $('#vertin-tips-modules-list');
    modulesList.empty();
    
    const modules = moduleManager.getModules();
    const settings = extension_settings[extensionName];
    
    modules.forEach(module => {
        const isEnabled = settings.modules?.[module.name]?.enabled || false;
        const isLoaded = moduleManager.isLoaded(module.name);
        
        let moduleHtml = `
            <div style="margin-bottom: 10px; padding: 8px; border: 1px solid #ddd; border-radius: 3px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${module.displayName || module.name}</strong>
                        <span style="margin-left: 10px; font-size: 12px; color: ${isLoaded ? '#28a745' : '#6c757d'};">
                            ${isLoaded ? '已加载' : '未加载'}
                        </span>
                    </div>
                    <label class="checkbox_label">
                        <input type="checkbox" data-module="${module.name}" ${isEnabled ? 'checked' : ''} />
                        <span>启用</span>
                    </label>
                </div>
                ${module.description ? `<div style="font-size: 12px; color: #666; margin-top: 5px;">${module.description}</div>` : ''}
        `;
        
        // 为自动备份模块添加特殊配置界面
        if (module.name === 'autoBackup') {
            const config = module.config || {};
            moduleHtml += `
                <div id="autoBackup-config" style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; ${isEnabled ? '' : 'display: none;'}">
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">备份间隔:</label>
                        <select id="autoBackup-interval" style="width: 100%; padding: 4px;">
                            <option value="15" ${config.interval === 15 ? 'selected' : ''}>15分钟</option>
                            <option value="30" ${config.interval === 30 ? 'selected' : ''}>30分钟</option>
                            <option value="60" ${config.interval === 60 ? 'selected' : ''}>1小时</option>
                            <option value="120" ${config.interval === 120 ? 'selected' : ''}>2小时</option>
                            <option value="180" ${config.interval === 180 ? 'selected' : ''}>3小时</option>
                            <option value="360" ${config.interval === 360 ? 'selected' : ''}>6小时</option>
                            <option value="720" ${config.interval === 720 ? 'selected' : ''}>12小时</option>
                            <option value="1440" ${config.interval === 1440 ? 'selected' : ''}>24小时</option>
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">备份目录:</label>
                        <div style="display: flex; gap: 5px;">
                            <input type="text" id="autoBackup-path" placeholder="留空使用默认路径（桌面）"
                                   value="${config.backupPath || ''}" style="flex: 1; padding: 4px;" />
                            <button type="button" id="autoBackup-browse" style="padding: 4px 8px;">浏览</button>
                        </div>
                        <small style="color: #666;">默认路径: ~/Desktop/SillyTavern-Backups</small>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">最大备份文件数:</label>
                        <input type="number" id="autoBackup-maxBackups" min="1" max="100"
                               value="${config.maxBackups || 10}" style="width: 100%; padding: 4px;" />
                        <small style="color: #666;">超过此数量的旧备份将被自动删除</small>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label class="checkbox_label">
                            <input type="checkbox" id="autoBackup-autoStart" ${config.enabled ? 'checked' : ''} />
                            <span>启用自动备份</span>
                        </label>
                    </div>
                    
                    <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                        <button type="button" id="autoBackup-manual" style="padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 3px;">
                            立即备份
                        </button>
                        <button type="button" id="autoBackup-list" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 3px;">
                            查看备份
                        </button>
                        <button type="button" id="autoBackup-openFolder" style="padding: 6px 12px; background: #6c757d; color: white; border: none; border-radius: 3px;">
                            打开备份文件夹
                        </button>
                    </div>
                </div>
            `;
        }
        
        moduleHtml += '</div>';
        modulesList.append(moduleHtml);
    });
    
    // 绑定模块开关事件
    modulesList.find('input[type="checkbox"][data-module]').on('change', async function() {
        const moduleName = $(this).data('module');
        const isEnabled = $(this).prop('checked');
        
        // 更新设置
        if (!settings.modules) settings.modules = {};
        if (!settings.modules[moduleName]) settings.modules[moduleName] = {};
        settings.modules[moduleName].enabled = isEnabled;
        
        // 加载/卸载模块
        if (isEnabled) {
            await moduleManager.load(moduleName);
        } else {
            await moduleManager.unload(moduleName);
        }
        
        saveSettingsDebounced();
        
        // 显示/隐藏配置界面
        if (moduleName === 'autoBackup') {
            const configDiv = $('#autoBackup-config');
            if (isEnabled) {
                configDiv.slideDown(200);
            } else {
                configDiv.slideUp(200);
            }
        }
        
        // 更新状态显示
        setTimeout(() => {
            updateModulesList();
        }, 100);
    });
    
    // 绑定自动备份配置事件
    bindAutoBackupEvents();
}

// 绑定自动备份配置事件
function bindAutoBackupEvents() {
    const autoBackupModule = moduleManager.modules.get('autoBackup');
    if (!autoBackupModule) return;
    
    // 备份间隔改变
    $('#autoBackup-interval').off('change').on('change', function() {
        const interval = parseInt($(this).val());
        autoBackupModule.setInterval(interval);
    });
    
    // 备份路径改变
    $('#autoBackup-path').off('change').on('change', function() {
        const path = $(this).val().trim();
        autoBackupModule.setBackupPath(path);
    });
    
    // 浏览文件夹
    $('#autoBackup-browse').off('click').on('click', async function() {
        try {
            if ('showDirectoryPicker' in window) {
                const dirHandle = await window.showDirectoryPicker();
                if (dirHandle) {
                    // 注意：File System Access API 无法直接获取路径字符串
                    // 这里只是示例，实际需要根据具体情况处理
                    $('#autoBackup-path').val(dirHandle.name);
                    autoBackupModule.setBackupPath(dirHandle.name);
                }
            } else {
                alert('您的浏览器不支持文件夹选择功能，请手动输入路径');
            }
        } catch (error) {
            console.warn('用户取消了文件夹选择');
        }
    });
    
    // 最大备份数改变
    $('#autoBackup-maxBackups').off('change').on('change', function() {
        const count = parseInt($(this).val());
        autoBackupModule.setMaxBackups(count);
    });
    
    // 自动备份开关
    $('#autoBackup-autoStart').off('change').on('change', function() {
        const enabled = $(this).prop('checked');
        autoBackupModule.setEnabled(enabled);
    });
    
    // 立即备份
    $('#autoBackup-manual').off('click').on('click', async function() {
        const button = $(this);
        button.prop('disabled', true).text('备份中...');
        
        try {
            const result = await autoBackupModule.manualBackup();
            if (result.success) {
                button.text('备份成功！');
                setTimeout(() => {
                    button.prop('disabled', false).text('立即备份');
                }, 2000);
            } else {
                button.text('备份失败');
                setTimeout(() => {
                    button.prop('disabled', false).text('立即备份');
                }, 2000);
            }
        } catch (error) {
            button.text('备份失败');
            setTimeout(() => {
                button.prop('disabled', false).text('立即备份');
            }, 2000);
        }
    });
    
    // 查看备份列表
    $('#autoBackup-list').off('click').on('click', async function() {
        try {
            const backups = await autoBackupModule.getBackupList();
            showBackupListDialog(backups);
        } catch (error) {
            alert('获取备份列表失败: ' + error.message);
        }
    });
    
    // 打开备份文件夹
    $('#autoBackup-openFolder').off('click').on('click', function() {
        const backupPath = autoBackupModule.getBackupPath();
        
        // 尝试在新窗口打开文件夹（仅在本地环境有效）
        if (typeof require !== 'undefined') {
            const { shell } = require('electron');
            shell.openPath(backupPath);
        } else {
            // 复制路径到剪贴板
            if (navigator.clipboard) {
                navigator.clipboard.writeText(backupPath).then(() => {
                    alert(`备份路径已复制到剪贴板: ${backupPath}`);
                });
            } else {
                alert(`备份路径: ${backupPath}`);
            }
        }
    });
}

// 显示备份列表对话框
function showBackupListDialog(backups) {
    const formatFileSize = (bytes) => {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    const formatDate = (date) => {
        return new Date(date).toLocaleString('zh-CN');
    };
    
    let listHtml = '<h3>备份文件列表</h3>';
    if (backups.length === 0) {
        listHtml += '<p>暂无备份文件</p>';
    } else {
        listHtml += '<div style="max-height: 300px; overflow-y: auto;">';
        backups.forEach((backup, index) => {
            listHtml += `
                <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: bold;">${backup.name}</div>
                        <div style="font-size: 12px; color: #666;">
                            创建时间: ${formatDate(backup.created)} | 大小: ${formatFileSize(backup.size)}
                        </div>
                    </div>
                    <div>
                        <button onclick="copyBackupPath('${backup.path}')" style="padding: 2px 8px; margin-right: 5px;">复制路径</button>
                        <button onclick="deleteBackup('${backup.path}', '${backup.name}')" style="padding: 2px 8px; background: #dc3545; color: white; border: none;">删除</button>
                    </div>
                </div>
            `;
        });
        listHtml += '</div>';
    }
    
    // 创建模态对话框
    const dialogHtml = `
        <div id="backup-list-dialog" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; justify-content: center; align-items: center;">
            <div style="background: white; padding: 20px; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto;">
                ${listHtml}
                <div style="margin-top: 15px; text-align: right;">
                    <button onclick="closeBackupListDialog()" style="padding: 8px 16px;">关闭</button>
                </div>
            </div>
        </div>
    `;
    
    $('body').append(dialogHtml);
}

// 全局函数：关闭备份列表对话框
window.closeBackupListDialog = function() {
    $('#backup-list-dialog').remove();
};

// 全局函数：复制备份路径
window.copyBackupPath = function(path) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(path).then(() => {
            alert('路径已复制到剪贴板');
        });
    } else {
        alert(`备份路径: ${path}`);
    }
};

// 全局函数：删除备份
window.deleteBackup = function(path, name) {
    if (confirm(`确定要删除备份文件 "${name}" 吗？此操作不可撤销。`)) {
        if (typeof require !== 'undefined') {
            const fs = require('fs');
            try {
                fs.unlinkSync(path);
                alert('备份文件已删除');
                closeBackupListDialog();
                // 重新显示列表
                const autoBackupModule = moduleManager.modules.get('autoBackup');
                if (autoBackupModule) {
                    autoBackupModule.getBackupList().then(showBackupListDialog);
                }
            } catch (error) {
                alert('删除失败: ' + error.message);
            }
        } else {
            alert('无法在浏览器环境中删除文件，请手动删除');
        }
    }
};