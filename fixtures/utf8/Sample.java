package com.example;

public class Sample {
	public void run() {
		MyLogger.writeError("startup failed");
		other.writeError("skip this line");
		MyLogger.writeError(e);
		MyLogger.writeError(ex);
		String text = "foo bar foo baz foo";
		MyLogger.writeError(text); // MyLogger.writeInfo(text);
	}
}
