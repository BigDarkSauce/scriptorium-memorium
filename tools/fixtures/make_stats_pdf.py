#!/usr/bin/env python3
"""Build the statistics tutorial PDF used by tools/test-ingest.mjs (deterministic, no network).

A 9-page "Statistics & Computation - Tutorial" in the style of a university course handout: an outline (bookmarks),
numbered sections and subsections, running headers and page numbers, an R code block and a Python code block on shaded
backgrounds (monospace), their printed output, a data table, two matplotlib figures with "Figure n.m" captions and a
worked t-test example. It reproduces what made the original tutorial hard to ingest: code boxes that look like vector
figures, a full-width header graphic repeated on every page, and long text paragraphs.

Usage:  python3 -I tools/fixtures/make_stats_pdf.py out.pdf
Needs:  reportlab, matplotlib (pip install --break-system-packages reportlab matplotlib)
"""
import io, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

W, H = A4
M = 22 * mm
TITLE = "Statistics & Computation - Tutorial"


def fig_png(kind):
    fig, ax = plt.subplots(figsize=(5.2, 2.6), dpi=110)
    if kind == "hist":
        import random
        random.seed(4)
        means = [sum(random.random() for _ in range(12)) / 12 for _ in range(1500)]
        ax.hist(means, bins=30, color="#4a6f9c", edgecolor="white")
        ax.set_xlabel("sample mean (n = 12)"); ax.set_ylabel("count")
    else:
        xs = [1.2, 2.0, 2.9, 3.8, 5.1, 6.0, 7.2, 8.1]
        ys = [2.3, 3.1, 4.4, 4.9, 6.8, 7.1, 8.9, 9.6]
        ax.scatter(xs, ys, color="#9c3a28")
        ax.plot([0.8, 8.5], [0.98 + 1.06 * 0.8, 0.98 + 1.06 * 8.5], color="#2a1e15")
        ax.set_xlabel("hours studied"); ax.set_ylabel("score")
    fig.tight_layout()
    b = io.BytesIO(); fig.savefig(b, format="png"); plt.close(fig); b.seek(0)
    return ImageReader(b)


class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.c.setTitle(TITLE); self.c.setAuthor("Tutorial fixture")
        self.page = 0; self.y = 0; self.started = False
        self.new_page()

    def furniture(self):
        c = self.c
        # a full-width header bar drawn as an image-like vector graphic on every page (the course template)
        c.setFillColorRGB(0.12, 0.23, 0.39); c.rect(0, H - 16 * mm, W, 16 * mm, stroke=0, fill=1)
        for k in range(8):
            c.setFillColorRGB(0.2 + k * .05, 0.3, 0.5); c.rect(W - 60 * mm + k * 6 * mm, H - 14 * mm, 4 * mm, 12 * mm, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica", 9); c.drawString(M, H - 10 * mm, "BYU 22SoI  " + TITLE)
        c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica", 9); c.drawCentredString(W / 2, 12 * mm, str(self.page))

    def new_page(self):
        if self.page:
            self.c.showPage()
        self.page += 1; self.furniture(); self.y = H - 30 * mm

    def need(self, h):
        if self.y - h < 22 * mm:
            self.new_page()

    def heading(self, num, title, level, key):
        size = {1: 17, 2: 13, 3: 11.5}[level]
        if level == 1 and self.started:
            self.new_page()   # every chapter starts on a new page, like the handout
        self.started = True
        self.need(size * 3)
        self.y -= size * (1.2 if level > 1 else 1.6)
        c = self.c; c.setFont("Helvetica-Bold", size); c.drawString(M, self.y, f"{num} {title}")
        c.bookmarkPage(key, fit="XYZ", top=self.y + size + 4)
        c.addOutlineEntry(f"{num} {title}", key, level=level - 1)
        self.y -= size * 0.7

    def para(self, text, size=10.5, lead=14):
        c = self.c; c.setFont("Times-Roman", size)
        words, line, maxw = text.split(), "", W - 2 * M
        lines = []
        for w in words:
            t = (line + " " + w).strip()
            if c.stringWidth(t, "Times-Roman", size) > maxw:
                lines.append(line); line = w
            else:
                line = t
        if line:
            lines.append(line)
        for l in lines:
            self.need(lead); self.y -= lead; c.setFont("Times-Roman", size); c.drawString(M, self.y, l)
        self.y -= 6

    def code(self, lines, output=None):
        lead = 12.5; h = lead * (len(lines) + (len(output) + 1 if output else 0)) + 12
        self.need(h); c = self.c
        # shaded box with a frame: the vector drawing a naive figure detector takes for a figure
        c.setFillColorRGB(0.95, 0.95, 0.93); c.setStrokeColorRGB(0.7, 0.7, 0.65)
        c.roundRect(M - 4, self.y - h, W - 2 * M + 8, h - 2, 4, stroke=1, fill=1)
        for k in range(3):
            c.setStrokeColorRGB(0.85, 0.85, 0.8); c.line(M - 4, self.y - h + 3 + k, M + 2, self.y - h + 3 + k)
        c.setFillColorRGB(0.1, 0.1, 0.1); yy = self.y - 6
        for l in lines:
            yy -= lead; c.setFont("Courier", 9.5); c.drawString(M + 4, yy, l)
        if output:
            yy -= lead * .4
            for l in output:
                yy -= lead; c.setFont("Courier", 9.5); c.setFillColorRGB(0.25, 0.25, 0.25); c.drawString(M + 4, yy, l)
            c.setFillColorRGB(0, 0, 0)
        self.y -= h + 8

    def table(self, cols, rows, caption):
        lead = 15; self.need(lead * (len(rows) + 3))
        c = self.c; self.y -= 14; c.setFont("Helvetica-Bold", 9.5); c.drawString(M, self.y, caption)
        self.y -= 6; x0 = M; cw = (W - 2 * M) / len(cols)
        c.setLineWidth(0.6); c.line(x0, self.y, W - M, self.y); self.y -= lead - 3
        c.setFont("Helvetica-Bold", 9.5)
        for k, t in enumerate(cols):
            c.drawString(x0 + k * cw + 3, self.y, t)
        self.y -= 4; c.line(x0, self.y, W - M, self.y)
        c.setFont("Helvetica", 9.5)
        for r in rows:
            self.y -= lead - 3
            for k, t in enumerate(r):
                c.drawString(x0 + k * cw + 3, self.y, t)
            self.y -= 3
        c.line(x0, self.y, W - M, self.y); self.y -= 10

    def figure(self, img, caption):
        fw = W - 2 * M - 30 * mm; fh = fw / 2
        self.need(fh + 30); c = self.c
        self.y -= fh; c.drawImage(img, M + 15 * mm, self.y, fw, fh)
        self.y -= 14; c.setFont("Times-Italic", 9.5); c.drawString(M + 15 * mm, self.y, caption); self.y -= 10

    def save(self):
        self.c.save()


LONG_INTRO = ("Statistics is the science of learning from data in the presence of variation. In this tutorial we work with "
              "small data sets that you can reproduce by hand and with a few lines of R or Python. Every computation is "
              "shown twice: once as a formula with every symbol defined, and once as code whose output you should check "
              "against the formula. The aim is not to memorise commands but to understand what each command computes, "
              "why the number it prints has the value it has, and how that number answers a question about the world. "
              "Throughout, a population is the whole collection we want to learn about, a sample is the part we observe, "
              "a parameter is a number describing the population and a statistic is a number computed from the sample.")


def build(path):
    d = Doc(path); c = d.c
    c.setFont("Helvetica-Bold", 22); d.y -= 10; c.drawString(M, d.y, TITLE); d.y -= 20
    c.setFont("Helvetica", 11); c.drawString(M, d.y, "BYU 22SoI - Statistics & Computation, week 3 handout"); d.y -= 14

    d.para("This handout accompanies the week 3 tutorial. Work through it with R or Python open; each section ends with a short computation to reproduce.")
    d.new_page(); d.started = True
    d.heading("1", "Data and variation", 1, "s1")
    d.para(LONG_INTRO)
    d.heading("1.1", "Populations, samples and statistics", 2, "s11")
    d.para("Definition 1.1. A statistic is any function of the sample values x1, ..., xn alone. The sample mean is "
           "x-bar = (x1 + ... + xn) / n and the sample variance is s^2 = sum (xi - x-bar)^2 / (n - 1). We divide by "
           "n - 1, not n, because the deviations from x-bar sum to zero, so only n - 1 of them are free.")
    d.heading("1.2", "Summaries in R", 2, "s12")
    d.para("The scores of eight students on a quiz are entered as a vector and summarised. Read each line of the code "
           "and predict its output before you look at it.")
    d.code(['scores <- c(12, 15, 9, 18, 14, 11, 16, 13)', 'mean(scores)', 'var(scores)', 'sd(scores)'],
           ['[1] 13.5', '[1] 8', '[1] 2.828427'])
    d.para("The mean 13.5 is the balance point of the eight scores. The variance 8 is in squared points, so we report "
           "the standard deviation 2.83 points, the typical distance of a score from the mean.")

    d.heading("2", "Describing a sample", 1, "s2")
    d.heading("2.1", "Frequency tables", 2, "s21")
    d.para("Table 2.1 lists the number of hours slept by 40 students the night before the exam, grouped in classes.")
    d.table(["Hours", "Students", "Relative frequency"], [["4-5", "3", "0.075"], ["5-6", "9", "0.225"], ["6-7", "14", "0.350"], ["7-8", "10", "0.250"], ["8-9", "4", "0.100"]],
            "Table 2.1: Hours of sleep of 40 students")
    d.para("The relative frequencies add to 1. The modal class is 6-7 hours, which holds 35 percent of the students.")
    d.heading("2.2", "The median and quartiles", 2, "s22")
    d.para("The median is the middle value of the ordered sample; with an even n it is the mean of the two middle "
           "values. For the quiz scores ordered as 9, 11, 12, 13, 14, 15, 16, 18 the median is (13 + 14) / 2 = 13.5. "
           "The first and third quartiles split off the lowest and highest quarter of the data.")

    d.heading("3", "Sampling distributions", 1, "s3")
    d.para("If we repeat the same sampling procedure many times, the statistic changes from sample to sample. The "
           "distribution of those values is the sampling distribution of the statistic. Its spread tells us how far a "
           "single estimate is likely to be from the parameter.")
    d.heading("3.1", "Simulating the sample mean in Python", 2, "s31")
    d.code(['import numpy as np', 'rng = np.random.default_rng(4)', 'means = rng.random((1500, 12)).mean(axis=1)', 'print(round(means.mean(), 3), round(means.std(ddof=1), 3))'],
           ['0.5 0.083'])
    d.para("Each of the 1500 rows is a sample of n = 12 uniform numbers. The printed standard deviation 0.083 matches "
           "the theory sigma / sqrt(n) = 0.2887 / sqrt(12) = 0.083.")
    d.figure(fig_png("hist"), "Figure 3.1: Means of 1500 samples of size 12 from a uniform distribution.")
    d.heading("3.2", "The central limit theorem", 2, "s32")
    d.para("Theorem 3.1 (central limit theorem). For independent observations with mean mu and finite standard "
           "deviation sigma, the standardised mean (x-bar - mu) / (sigma / sqrt(n)) has approximately a standard normal "
           "distribution when n is large. Figure 3.1 already looks bell-shaped although each observation is uniform.")

    d.heading("4", "Testing a hypothesis", 1, "s4")
    d.heading("4.1", "The one-sample t-test", 2, "s41")
    d.para("Example 4.1. A tutor claims the mean quiz score is 12. Our sample of eight has x-bar = 13.5 and s = 2.828. "
           "The test statistic is t = (13.5 - 12) / (2.828 / sqrt(8)) = 1.5 / 1.0 = 1.5 with n - 1 = 7 degrees of "
           "freedom. The two-sided p-value is 0.177, so at the 5 percent level we do not reject the claim.")
    d.code(['t.test(scores, mu = 12)'], ['t = 1.5, df = 7, p-value = 0.1773', '95 percent confidence interval:', ' 11.13554 15.86446'])
    d.para("The confidence interval from 11.14 to 15.86 contains 12, which is the same conclusion seen from the "
           "interval: the data are compatible with a mean of 12.")

    d.heading("5", "Linear regression", 1, "s5")
    d.heading("5.1", "Least squares", 2, "s51")
    d.para("For pairs (xi, yi) the least-squares line y = b0 + b1 x minimises the sum of squared vertical distances. "
           "Its slope is b1 = sum (xi - x-bar)(yi - y-bar) / sum (xi - x-bar)^2 and its intercept b0 = y-bar - b1 x-bar. "
           "For the eight students of Figure 5.1, b1 = 1.06 points per hour and b0 = 0.98 points.")
    d.figure(fig_png("scatter"), "Figure 5.1: Quiz score against hours studied, with the least-squares line.")
    d.code(['fit <- lm(score ~ hours)', 'coef(fit)'], ['(Intercept)       hours', '      0.98        1.06'])
    d.para("The coefficient of hours says that each extra hour of study goes with about 1.06 more points on average; "
           "it does not say that studying causes the gain, because the data are observational.")
    d.save()


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "stats-tutorial.pdf")
