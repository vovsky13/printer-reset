"""
Графический интерфейс для сброса счётчика памперса (waste ink pad counter).
"""

import threading
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

from detect import find_printers
import epson
import canon


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Сброс счётчика памперса — Epson & Canon")
        self.resizable(False, False)
        self.configure(bg="#f0f0f0")
        self._printers = []
        self._build_ui()
        self._scan()

    # ------------------------------------------------------------------ UI --

    def _build_ui(self):
        pad = dict(padx=10, pady=6)

        # Заголовок
        title = tk.Label(self, text="Сброс счётчика памперса струйных принтеров",
                         font=("Helvetica", 13, "bold"), bg="#f0f0f0")
        title.grid(row=0, column=0, columnspan=2, **pad)

        # Список принтеров
        frame_list = ttk.LabelFrame(self, text="Обнаруженные принтеры")
        frame_list.grid(row=1, column=0, columnspan=2, sticky="ew", padx=10, pady=4)

        self._listbox = tk.Listbox(frame_list, width=60, height=6, selectmode=tk.EXTENDED,
                                   font=("Courier", 11))
        self._listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=4, pady=4)

        scroll = ttk.Scrollbar(frame_list, orient=tk.VERTICAL, command=self._listbox.yview)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self._listbox.configure(yscrollcommand=scroll.set)

        # Кнопки
        btn_frame = tk.Frame(self, bg="#f0f0f0")
        btn_frame.grid(row=2, column=0, columnspan=2, pady=4)

        self._btn_scan = ttk.Button(btn_frame, text="🔍  Обновить список",
                                    command=self._scan)
        self._btn_scan.pack(side=tk.LEFT, padx=6)

        self._btn_reset = ttk.Button(btn_frame, text="🗑️  Сбросить счётчик",
                                     command=self._reset_selected)
        self._btn_reset.pack(side=tk.LEFT, padx=6)

        self._btn_reset_all = ttk.Button(btn_frame, text="⚡  Сбросить ВСЕ",
                                         command=self._reset_all)
        self._btn_reset_all.pack(side=tk.LEFT, padx=6)

        # Лог
        frame_log = ttk.LabelFrame(self, text="Лог операций")
        frame_log.grid(row=3, column=0, columnspan=2, sticky="ew", padx=10, pady=4)

        self._log = scrolledtext.ScrolledText(frame_log, width=60, height=12,
                                              state=tk.DISABLED,
                                              font=("Courier", 10),
                                              bg="#1e1e1e", fg="#d4d4d4",
                                              insertbackground="white")
        self._log.pack(padx=4, pady=4, fill=tk.BOTH, expand=True)

        # Статус-бар
        self._status_var = tk.StringVar(value="Готов")
        status_bar = tk.Label(self, textvariable=self._status_var,
                              relief=tk.SUNKEN, anchor=tk.W,
                              bg="#dde", font=("Helvetica", 9))
        status_bar.grid(row=4, column=0, columnspan=2, sticky="ew", padx=0, pady=(4, 0))

        self.columnconfigure(0, weight=1)

    # --------------------------------------------------------------- Helpers --

    def _log_write(self, msg: str):
        self._log.configure(state=tk.NORMAL)
        self._log.insert(tk.END, msg + "\n")
        self._log.see(tk.END)
        self._log.configure(state=tk.DISABLED)

    def _set_buttons(self, enabled: bool):
        state = tk.NORMAL if enabled else tk.DISABLED
        self._btn_scan.configure(state=state)
        self._btn_reset.configure(state=state)
        self._btn_reset_all.configure(state=state)

    # ---------------------------------------------------------------- Actions --

    def _scan(self):
        self._listbox.delete(0, tk.END)
        self._printers = []
        self._log_write("— Сканирование USB-принтеров...")
        self._status_var.set("Сканирование...")
        try:
            printers = find_printers()
        except Exception as e:
            self._log_write(f"  Ошибка сканирования: {e}")
            self._status_var.set("Ошибка сканирования")
            return

        if not printers:
            self._log_write("  Принтеры не найдены. Проверьте USB-подключение.")
            self._status_var.set("Принтеры не найдены")
        else:
            for p in printers:
                self._printers.append(p)
                self._listbox.insert(tk.END, str(p))
            self._log_write(f"  Найдено: {len(printers)} принт(ер/ера/еров)")
            self._status_var.set(f"Найдено {len(printers)} принтеров")

    def _do_reset(self, printer_list):
        """Выполняется в отдельном потоке."""
        self.after(0, lambda: self._set_buttons(False))
        success = 0
        fail = 0
        for p in printer_list:
            self.after(0, lambda name=str(p): self._log_write(f"\n>> {name}"))
            self.after(0, lambda name=str(p): self._status_var.set(f"Сброс: {name}"))

            def log_proxy(msg, p=p):
                self.after(0, lambda m=msg: self._log_write(m))

            if p.vendor == 'epson':
                ok = epson.reset_waste_ink(p, log_cb=log_proxy)
            else:
                ok = canon.reset_waste_ink(p, log_cb=log_proxy)

            if ok:
                success += 1
            else:
                fail += 1

        summary = f"\nГотово: успешно={success}, ошибок={fail}"
        self.after(0, lambda: self._log_write(summary))
        self.after(0, lambda: self._status_var.set(f"Завершено: успешно {success}, ошибок {fail}"))
        self.after(0, lambda: self._set_buttons(True))

        if fail == 0:
            self.after(0, lambda: messagebox.showinfo(
                "Успех",
                f"Счётчик памперса сброшен на {success} принтере(ах).\n"
                "Выключите и включите принтер для применения изменений."
            ))
        else:
            self.after(0, lambda: messagebox.showwarning(
                "Частичный результат",
                f"Успешно: {success}, ошибок: {fail}.\n"
                "Смотрите лог для деталей."
            ))

    def _reset_selected(self):
        indices = self._listbox.curselection()
        if not indices:
            messagebox.showwarning("Нет выбора", "Выберите принтер из списка.")
            return
        selected = [self._printers[i] for i in indices]
        if not messagebox.askyesno("Подтверждение",
                                   f"Сбросить счётчик памперса на {len(selected)} принтере(ах)?"):
            return
        threading.Thread(target=self._do_reset, args=(selected,), daemon=True).start()

    def _reset_all(self):
        if not self._printers:
            messagebox.showwarning("Нет принтеров", "Принтеры не найдены. Нажмите «Обновить список».")
            return
        if not messagebox.askyesno("Подтверждение",
                                   f"Сбросить счётчик памперса на ВСЕХ {len(self._printers)} принтере(ах)?"):
            return
        threading.Thread(target=self._do_reset, args=(self._printers,), daemon=True).start()
