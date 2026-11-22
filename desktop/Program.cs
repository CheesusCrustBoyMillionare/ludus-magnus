// Ludus Magnus desktop shell.
// A single exe that carries the game files inside it and serves them from memory
// to a WebView2 window. Saves live under %LOCALAPPDATA%\LudusMagnus.
// Written for the C# 5 compiler that ships with Windows (.NET Framework 4.x).
using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program
{
    internal static string BaseDir;

    [STAThread]
    static void Main()
    {
        BaseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LudusMagnus");
        // The WebView2 assemblies are embedded in this exe; hand them to the loader on request.
        AppDomain.CurrentDomain.AssemblyResolve += Resolve;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            Unpack();
            Run();
        }
        catch (Exception e)
        {
            MessageBox.Show("Ludus Magnus could not start.\n\n" + e.Message, "Ludus Magnus", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static void Run()
    {
        Application.Run(new MainForm());
    }

    static Assembly Resolve(object sender, ResolveEventArgs args)
    {
        string name = "lib." + new AssemblyName(args.Name).Name + ".dll";
        using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        {
            if (s == null) return null;
            byte[] bytes = new byte[s.Length];
            s.Read(bytes, 0, bytes.Length);
            return Assembly.Load(bytes);
        }
    }

    // Writes the embedded native loader ("bin/...") under BaseDir. The game files stay inside the exe.
    static void Unpack()
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        foreach (string res in asm.GetManifestResourceNames())
        {
            if (!res.StartsWith("bin/")) continue;
            string target = Path.Combine(BaseDir, res.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            try
            {
                using (Stream s = asm.GetManifestResourceStream(res))
                using (FileStream f = new FileStream(target, FileMode.Create, FileAccess.Write))
                {
                    s.CopyTo(f);
                }
            }
            catch (IOException)
            {
                // Another copy of the game is running and has the file open; the existing copy will do.
                if (!File.Exists(target)) throw;
            }
        }
    }
}

class MainForm : Form
{
    readonly WebView2 web = new WebView2();

    static string Mime(string path)
    {
        string ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext == ".html") return "text/html; charset=utf-8";
        if (ext == ".js") return "text/javascript; charset=utf-8";
        if (ext == ".css") return "text/css; charset=utf-8";
        if (ext == ".json") return "application/json";
        if (ext == ".png") return "image/png";
        if (ext == ".woff2") return "font/woff2";
        return "application/octet-stream";
    }

    public MainForm()
    {
        Text = "Ludus Magnus";
        BackColor = Color.FromArgb(23, 17, 15);
        StartPosition = FormStartPosition.CenterScreen;
        float scale;
        using (Graphics g = CreateGraphics()) scale = g.DpiX / 96f;
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        ClientSize = new Size(Math.Min((int)(1280 * scale), area.Width - 80), Math.Min((int)(820 * scale), area.Height - 80));
        MinimumSize = new Size((int)(820 * scale), (int)(560 * scale));
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }

        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = BackColor;
        Controls.Add(web);
        Load += OnLoad;
    }

    async void OnLoad(object sender, EventArgs e)
    {
        try
        {
            CoreWebView2Environment.SetLoaderDllFolderPath(Path.Combine(Program.BaseDir, "bin"));
            // Saves (the page's localStorage) live in this folder.
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.BaseDir, "data"), null);
            await web.EnsureCoreWebView2Async(env);
            CoreWebView2 core = web.CoreWebView2;
            // Every request for https://ludus.game/... is answered from the resources embedded in this exe.
            core.AddWebResourceRequestedFilter("https://ludus.game/*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += delegate(object s2, CoreWebView2WebResourceRequestedEventArgs args)
            {
                string path = Uri.UnescapeDataString(new Uri(args.Request.Uri).AbsolutePath).TrimStart('/');
                if (path.Length == 0) path = "index.html";
                MemoryStream body = null;
                using (Stream res = Assembly.GetExecutingAssembly().GetManifestResourceStream("app/" + path))
                {
                    if (res != null) { body = new MemoryStream(); res.CopyTo(body); body.Position = 0; }
                }
                args.Response = body == null
                    ? env.CreateWebResourceResponse(null, 404, "Not Found", "")
                    : env.CreateWebResourceResponse(body, 200, "OK", "Content-Type: " + Mime(path) + "\r\nCache-Control: no-store");
            };
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            // "Exit the game" in the menu asks the page to close itself: that closes the window.
            core.WindowCloseRequested += delegate(object s3, object a3) { Close(); };
            web.Source = new Uri("https://ludus.game/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Ludus Magnus needs the Microsoft Edge WebView2 Runtime, which is part of Windows 11 and most Windows 10 installs.\n\n" + ex.Message,
                "Ludus Magnus", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }
}
